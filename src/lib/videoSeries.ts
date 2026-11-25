export interface VideoEpisode {
  key: string;
  id: string;
  title: string;
  duration: string;
  durationSec: number;
  poster: string;
}

export interface VideoSeries {
  slug: string;
  title: string;
  subtitle: string;
  tone: "sage" | "lavender" | "leaf";
  episodes: readonly VideoEpisode[];
}

export const tiktokProfile = "https://www.tiktok.com/@haeonkorean";

export const videoSeriesList: readonly VideoSeries[] = [
  {
    slug: "terminal",
    title: "터미널",
    subtitle: "탈것과 내리는 곳의 차이",
    tone: "sage",
    episodes: [
      {
        key: "terminal-1",
        id: "7707203921374219527",
        title: "터미널 vs 종점",
        duration: "1:05",
        durationSec: 65,
        poster: "/videos/terminal-1.jpg",
      },
      {
        key: "terminal-2",
        id: "7707205899898719495",
        title: "정차·경유·정류장·정거장",
        duration: "1:30",
        durationSec: 90,
        poster: "/videos/terminal-2.jpg",
      },
    ],
  },
  {
    slug: "japda",
    title: "잡다",
    subtitle: "손에서 마음까지 뻗어 가는 말",
    tone: "lavender",
    episodes: [
      {
        key: "japda-1",
        id: "7707206258381638930",
        title: "쥐는 게 전부가 아니에요",
        duration: "1:30",
        durationSec: 90,
        poster: "/videos/japda-1.jpg",
      },
      {
        key: "japda-2",
        id: "7707207155501305096",
        title: "자리 잡다, 뜻이 두 개",
        duration: "1:30",
        durationSec: 90,
        poster: "/videos/japda-2.jpg",
      },
      {
        key: "japda-3",
        id: "7707207426793098503",
        title: "감 잡았어?",
        duration: "1:44",
        durationSec: 104,
        poster: "/videos/japda-3.jpg",
      },
    ],
  },
  {
    slug: "geureonikka",
    title: "그러니까 짜임새",
    subtitle: "상황을 잇는 말의 결",
    tone: "leaf",
    episodes: [
      {
        key: "geureonikka-1",
        id: "7707207624613203207",
        title: "그러니까 = So만 알면 반쪽",
        duration: "1:42",
        durationSec: 102,
        poster: "/videos/geureonikka-1.jpg",
      },
      {
        key: "geureonikka-2",
        id: "7707207847981075730",
        title: "비 온다고 했잖아",
        duration: "1:45",
        durationSec: 105,
        poster: "/videos/geureonikka-2.jpg",
      },
      {
        key: "geureonikka-3",
        id: "7707208047805893896",
        title: "그게 말야 vs 그건 말야",
        duration: "1:55",
        durationSec: 115,
        poster: "/videos/geureonikka-3.jpg",
      },
      {
        key: "geureonikka-4",
        id: "7707208231352945928",
        title: "셋 중 뭘 고를까",
        duration: "1:51",
        durationSec: 111,
        poster: "/videos/geureonikka-4.jpg",
      },
    ],
  },
];

export const playerUrl = (id: string) =>
  `https://www.tiktok.com/player/v1/${id}?autoplay=1&rel=0&music_info=0&description=0`;

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
