import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import { comingSoonRedirects } from "./scripts/redirects.mjs";

const site = process.env.SITE_URL || "http://localhost:4321";

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "always",
  redirects: Object.fromEntries(comingSoonRedirects.map((pathname) => [pathname, "/"])),
  integrations: [
    sitemap({
      filter: (page) =>
        !comingSoonRedirects.some((pathname) => new URL(page).pathname.startsWith(`${pathname}/`)),
      namespaces: {
        news: false,
        video: false,
      },
    }),
  ],
});
