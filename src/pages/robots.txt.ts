import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const baseUrl = new URL(site ?? import.meta.env.SITE_URL ?? "http://localhost:4321");
  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";

  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${new URL("sitemap-index.xml", baseUrl).toString()}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
