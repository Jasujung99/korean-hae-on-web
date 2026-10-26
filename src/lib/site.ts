const env = import.meta.env;

export const site = {
  name: "해온",
  nameLatin: "haeon",
  copyrightName: "haeonkorean",
  url: env.SITE_URL || "http://localhost:4321",
  locale: "ko_KR",
  tagline: "Your voice, in Korean.",
  opening: {
    date: "2026-11-20",
    label: "20 Nov 2026",
  },
  links: {
    // Threads account URL. The coming-soon page hides the Threads link while this is empty.
    threads: "https://www.threads.com/@haeumkorean",
    letters: "https://haeum.haeonkorean.com/",
  },
};

export function absoluteUrl(pathname: string) {
  return new URL(pathname, site.url).toString();
}
