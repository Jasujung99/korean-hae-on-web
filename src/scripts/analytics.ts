type AnalyticsValue = string | number | boolean | undefined | Record<string, unknown>[];

type AnalyticsDetail = Record<string, AnalyticsValue> & {
  event: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const allowedDatasetKeys = [
  "analyticsId",
  "analyticsLocation",
  "destinationPath",
  "learningPath",
  "formId",
  "leadType",
  "itemId",
  "itemName",
  "itemCategory",
  "serviceType",
  "currency",
  "value",
  "outboundDomain",
] as const;

function track(detail: AnalyticsDetail) {
  const { event, ...parameters } = detail;
  if (typeof window.gtag === "function") {
    window.gtag("event", event, parameters);
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(detail);
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element
    ? event.target.closest<HTMLElement>("[data-analytics-event]")
    : null;
  if (!target) return;

  const detail: AnalyticsDetail = {
    event: target.dataset.analyticsEvent || "cta_click",
  };

  allowedDatasetKeys.forEach((key) => {
    const value = target.dataset[key];
    if (value) detail[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
  });

  if (detail.item_id) {
    detail.items = [{
      item_id: detail.item_id,
      item_name: detail.item_name,
      item_category: detail.item_category,
      price: detail.value ? Number(detail.value) : undefined,
      quantity: 1,
    }];
    if (detail.value) detail.value = Number(detail.value);
  }

  track(detail);
});

window.addEventListener("haeon:track", (event) => {
  if (!(event instanceof CustomEvent) || !event.detail?.event) return;
  track(event.detail as AnalyticsDetail);
});

export {};
