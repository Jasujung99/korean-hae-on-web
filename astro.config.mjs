import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

const site = process.env.SITE_URL || "http://localhost:4321";
const noindexPaths = [
  "/start/",
  "/thanks/",
  "/privacy/",
  "/terms/",
  "/refund/",
];

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "always",
  integrations: [
    sitemap({
      filter: (page) => !noindexPaths.some((pathname) => new URL(page).pathname.startsWith(pathname)),
      namespaces: {
        news: false,
        video: false,
      },
    }),
  ],
});
