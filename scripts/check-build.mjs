import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(rootDir, "dist");

const expectedHtmlRoutes = [
  ["/", "index.html"],
  ["/start/", "start/index.html"],
  ["/events/free-pronunciation-coaching/", "events/free-pronunciation-coaching/index.html"],
  ["/classes/", "classes/index.html"],
  ["/study-kits/", "study-kits/index.html"],
  ["/contact/", "contact/index.html"],
  ["/thanks/coaching/", "thanks/coaching/index.html"],
  ["/thanks/inquiry/", "thanks/inquiry/index.html"],
  ["/privacy/", "privacy/index.html"],
  ["/terms/", "terms/index.html"],
  ["/refund/", "refund/index.html"],
  ["404.astro", "404.html"],
];

const expectedPublicFiles = [
  "robots.txt",
  "sitemap-index.xml",
  "share/daily-life-and-time.pptx",
  "share/.htaccess",
];

function toPosixPath(value) {
  return value.split(sep).join("/");
}

async function collectFiles(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, base)));
    } else if (entry.isFile()) {
      files.push(toPosixPath(relative(base, absolutePath)));
    }
  }

  return files;
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([\da-f]+);/gi, (_, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)));
}

function parseAttributes(tag) {
  const attributes = new Map();
  const pattern = /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of tag.matchAll(pattern)) {
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes.set(match[1].toLowerCase(), decodeHtml(value));
  }

  return attributes;
}

function findMetaContent(html, name) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    if (attributes.get("name")?.toLowerCase() === name) {
      return attributes.get("content")?.trim() ?? "";
    }
  }

  return "";
}

function findCanonical(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const rel = attributes.get("rel")?.toLowerCase().split(/\s+/) ?? [];
    if (rel.includes("canonical")) {
      return attributes.get("href")?.trim() ?? "";
    }
  }

  return "";
}

function findTitle(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return "";
  return decodeHtml(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function findElementIds(html) {
  const ids = new Set();

  for (const match of html.matchAll(/<[a-z][^>]*>/gi)) {
    const id = parseAttributes(match[0]).get("id");
    if (id) ids.add(id);
  }

  return ids;
}

function routeForHtmlFile(file) {
  if (file === "index.html") return "/";
  if (file.endsWith("/index.html")) return `/${file.slice(0, -"index.html".length)}`;
  return `/${file}`;
}

function safeDecodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function outputCandidates(pathname) {
  const decoded = safeDecodePathname(pathname).replace(/^\/+/, "");
  if (!decoded) return ["index.html"];

  const clean = decoded.replace(/\/+$/, "");
  if (pathname.endsWith("/")) return [`${clean}/index.html`];
  if (extname(clean)) return [clean];

  return [clean, `${clean}.html`, `${clean}/index.html`];
}

function sourceLine(html, offset) {
  return html.slice(0, offset).split("\n").length;
}

function validateMetadata(file, html, errors) {
  const title = findTitle(html);
  const description = findMetaContent(html, "description");
  const canonical = findCanonical(html);
  const robots = findMetaContent(html, "robots");

  if (!title) errors.push(`${file}: missing or empty <title>`);
  if (!description) errors.push(`${file}: missing or empty meta description`);

  if (!canonical) {
    errors.push(`${file}: missing or empty canonical link`);
  } else {
    try {
      const canonicalUrl = new URL(canonical);
      if (!/^https?:$/.test(canonicalUrl.protocol)) {
        errors.push(`${file}: canonical must use http or https (${canonical})`);
      }
    } catch {
      errors.push(`${file}: canonical must be an absolute URL (${canonical})`);
    }
  }

  if (!robots) {
    errors.push(`${file}: missing or empty robots meta`);
  } else if (!/(^|,)\s*(?:no)?index\s*(?:,|$)/i.test(robots)) {
    errors.push(`${file}: robots meta needs an index or noindex directive (${robots})`);
  }
}

async function validateInternalLinks(htmlFiles, distFiles, htmlCache, errors) {
  for (const file of htmlFiles) {
    const html = htmlCache.get(file);
    const canonical = findCanonical(html);
    let origin = "https://build-check.invalid";

    try {
      origin = new URL(canonical).origin;
    } catch {
      // Metadata validation reports malformed canonicals separately.
    }

    const pageUrl = new URL(routeForHtmlFile(file), origin);

    for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
      const href = parseAttributes(match[0]).get("href");
      if (href === undefined) continue;

      const location = `${file}:${sourceLine(html, match.index ?? 0)}`;
      if (!href.trim()) {
        errors.push(`${location}: empty href`);
        continue;
      }

      let targetUrl;
      try {
        targetUrl = new URL(href, pageUrl);
      } catch {
        errors.push(`${location}: invalid href (${href})`);
        continue;
      }

      if (!/^https?:$/.test(targetUrl.protocol) || targetUrl.origin !== pageUrl.origin) continue;

      const candidates = outputCandidates(targetUrl.pathname);
      const targetFile = candidates.find((candidate) => distFiles.has(candidate));
      if (!targetFile) {
        errors.push(
          `${location}: broken internal href ${JSON.stringify(href)} ` +
            `(expected ${candidates.join(" or ")})`,
        );
        continue;
      }

      if (!targetUrl.hash || !targetFile.endsWith(".html")) continue;

      let fragment = targetUrl.hash.slice(1);
      try {
        fragment = decodeURIComponent(fragment);
      } catch {
        // Keep the encoded fragment so a malformed value is reported as missing.
      }

      if (!fragment) continue;
      const targetHtml = htmlCache.get(targetFile) ?? (await readFile(resolve(distDir, targetFile), "utf8"));
      htmlCache.set(targetFile, targetHtml);
      if (!findElementIds(targetHtml).has(fragment)) {
        errors.push(`${location}: href ${JSON.stringify(href)} targets missing id ${JSON.stringify(fragment)}`);
      }
    }
  }
}

async function validateRobots(distFiles, errors) {
  if (!distFiles.has("robots.txt")) return;

  const robots = await readFile(resolve(distDir, "robots.txt"), "utf8");
  if (!/^User-agent:\s*\*\s*$/im.test(robots)) {
    errors.push("robots.txt: missing wildcard User-agent directive");
  }
  if (!/^Allow:\s*\/\s*$/im.test(robots)) {
    errors.push("robots.txt: missing Allow: / directive");
  }

  const sitemap = robots.match(/^Sitemap:\s*(\S+)\s*$/im)?.[1];
  if (!sitemap) {
    errors.push("robots.txt: missing Sitemap directive");
    return;
  }

  try {
    const sitemapUrl = new URL(sitemap);
    const sitemapFile = outputCandidates(sitemapUrl.pathname).find((candidate) => distFiles.has(candidate));
    if (!sitemapFile) errors.push(`robots.txt: Sitemap target does not exist (${sitemap})`);
  } catch {
    errors.push(`robots.txt: Sitemap must be an absolute URL (${sitemap})`);
  }
}

async function main() {
  const errors = [];

  try {
    if (!(await stat(distDir)).isDirectory()) throw new Error("not a directory");
  } catch {
    console.error(`Build verification failed: dist directory not found at ${distDir}`);
    process.exit(1);
  }

  const files = await collectFiles(distDir);
  const distFiles = new Set(files);

  for (const [route, outputFile] of expectedHtmlRoutes) {
    if (!distFiles.has(outputFile)) {
      errors.push(`missing route ${route}: expected dist/${outputFile}`);
    }
  }

  for (const outputFile of expectedPublicFiles) {
    if (!distFiles.has(outputFile)) errors.push(`missing public build file: dist/${outputFile}`);
  }

  const htmlFiles = files.filter((file) => file.endsWith(".html")).sort();
  const htmlCache = new Map();

  for (const file of htmlFiles) {
    const html = await readFile(resolve(distDir, file), "utf8");
    htmlCache.set(file, html);
    validateMetadata(file, html, errors);
  }

  await validateInternalLinks(htmlFiles, distFiles, htmlCache, errors);
  await validateRobots(distFiles, errors);

  if (errors.length > 0) {
    console.error(`Build verification failed with ${errors.length} error(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `Build verification passed: ${expectedHtmlRoutes.length} routes, ` +
      `${htmlFiles.length} HTML files, and ${files.length} total files checked.`,
  );
}

main().catch((error) => {
  console.error("Build verification failed with an unexpected error:");
  console.error(error);
  process.exit(1);
});
