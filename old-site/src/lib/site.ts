const env = import.meta.env;

export const siteConfig = {
  name: "해온 HAEON",
  shortName: "해온",
  siteUrl: env.SITE_URL || "http://localhost:4321",
  locale: "ko_KR",
  contactEmail: env.PUBLIC_CONTACT_EMAIL || "",
  responseTime: "2영업일 이내",
  coaching: {
    duration: "20분",
    channel: "온라인 1:1",
    price: "무료",
    formEndpoint: env.PUBLIC_COACHING_FORM_ENDPOINT || "",
  },
  inquiryFormEndpoint: env.PUBLIC_INQUIRY_FORM_ENDPOINT || "",
  kit: {
    id: "hangeul-vowels-kit",
    name: "한글 모음 원리 키트",
    price: Number(env.PUBLIC_STUDY_KIT_PRICE || 19000),
    currency: "KRW",
    checkoutUrl: env.PUBLIC_STUDY_KIT_CHECKOUT_URL || "",
    pageCount: 18,
    videoCount: 4,
  },
  business: {
    name: env.PUBLIC_BUSINESS_NAME || "해온 HAEON",
    representative: env.PUBLIC_REPRESENTATIVE_NAME || "",
    businessNumber: env.PUBLIC_BUSINESS_NUMBER || "",
    ecommerceNumber: env.PUBLIC_ECOMMERCE_NUMBER || "",
    address: env.PUBLIC_BUSINESS_ADDRESS || "",
  },
} as const;

export function absoluteUrl(pathname: string) {
  return new URL(pathname, siteConfig.siteUrl).toString();
}

export function formatKrw(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value);
}
