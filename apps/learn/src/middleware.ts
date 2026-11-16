import { defineMiddleware } from "astro:middleware";
import { getConfig } from "./lib/config";
import { apiError, guardApiRequest } from "./lib/security";

export const onRequest = defineMiddleware(async (context, next) => {
  const config = getConfig();
  context.locals.preview = config.preview;
  context.locals.appOrigin = config.appOrigin;

  const { pathname } = context.url;
  if (pathname.startsWith("/api/")) {
    const result = guardApiRequest(context.request, config.appOrigin);
    if (!result.ok) return apiError(result.status, result.code);
  }

  const response = await next();
  // 비공개 학습 앱: 검색 노출 금지, 다른 사이트에 프레임으로 넣지 않음.
  response.headers.set("x-robots-tag", "noindex, nofollow");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("referrer-policy", "same-origin");
  response.headers.set("x-content-type-options", "nosniff");
  if (pathname.startsWith("/api/")) response.headers.set("cache-control", "no-store");
  return response;
});
