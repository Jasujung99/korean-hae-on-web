/**
 * 대표 사이트 맛보기 자료.
 * 낱말·뜻·예문은 소리 앱 운영 DB의 승인 문항(j_ch_jj)에서 그대로 옮겼고,
 * 음원은 소리 앱이 쓰는 같은 녹음을 public/sori-teaser/에 복사해 두었다.
 * 영상 번호는 틱톡 @haeonkorean에 올라간 순서와 커버(영상/05_틱톡업로드/covers)를 맞춰 적었다.
 */

export type Consonant = "ㅈ" | "ㅊ" | "ㅉ";

export interface TeaserVoice {
  key: "charon" | "erinome" | "sulafat";
  label: string;
}

export interface TeaserItem {
  id: string;
  word: string;
  answer: Consonant;
  /** 빈칸 뒤에 남는 모음 */
  vowel: string;
  /** 첫소리 뒤에 이어지는 글자 */
  rest: string;
  pos: string;
  scene: string;
  gloss: string;
  example: string;
}

export const consonants: readonly Consonant[] = ["ㅈ", "ㅊ", "ㅉ"];

export const voices: readonly TeaserVoice[] = [
  { key: "charon", label: "남성" },
  { key: "erinome", label: "여성(1)" },
  { key: "sulafat", label: "여성(2)" },
];

export const teaserItems: readonly TeaserItem[] = [
  {
    id: "q1",
    word: "차다",
    answer: "ㅊ",
    vowel: "ㅏ",
    rest: "다",
    pos: "형용사",
    scene: "날씨나 음료를 말할 때",
    gloss: "물이나 공기의 온도가 낮다.",
    example: "아침 바람이 꽤 차니 외투를 챙기세요.",
  },
  {
    id: "q2",
    word: "짜다",
    answer: "ㅉ",
    vowel: "ㅏ",
    rest: "다",
    pos: "형용사",
    scene: "음식 간을 볼 때",
    gloss: "소금기 같은 맛이 진하다.",
    example: "국물이 조금 짜서 물을 더 넣고 끓였어요.",
  },
  {
    id: "q3",
    word: "자다",
    answer: "ㅈ",
    vowel: "ㅏ",
    rest: "다",
    pos: "동사",
    scene: "수면 습관을 말할 때",
    gloss: "눈을 감고 몸과 마음을 쉬며 잠에 들다.",
    example: "어젯밤에 일찍 자서 아침에 개운해요.",
  },
];

export const audioUrl = (id: string, kind: "word" | "sentence", voice: TeaserVoice["key"]) =>
  `/sori-teaser/${id}-${kind}-${voice}.m4a`;

export interface TeaserVideo {
  id: string;
  series: string;
  title: string;
  poster: string;
}

export const tiktokProfile = "https://www.tiktok.com/@haeonkorean";

export const teaserVideos: readonly TeaserVideo[] = [
  { id: "7707203921374219527", series: "터미널 1/2", title: "터미널 ≠ 종점", poster: "/videos/terminal-1.jpg" },
  { id: "7707206258381638930", series: "잡다 1/3", title: "쥐는 게 전부가 아니에요", poster: "/videos/japda-1.jpg" },
  { id: "7707207624613203207", series: "그러니까·말야 1/4", title: "그러니까는 So만 알면 반쪽", poster: "/videos/geureonikka-1.jpg" },
];

/** 누른 뒤에만 불러오는 틱톡 Embed Player 주소. 키가 필요 없다. */
export const playerUrl = (id: string) =>
  `https://www.tiktok.com/player/v1/${id}?autoplay=1&rel=0&music_info=0&description=0&closed_caption=1`;
