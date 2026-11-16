/**
 * 해온 실제 로고(src/design-system/logos/logo-olive.svg)에서 표식·이름 경로를 꺼낸다.
 * 본사이트 HaeonLogo.astro 와 같은 방식이며 로고 파일을 복사하지 않는다.
 */
import logoSource from "../../../../src/design-system/logos/logo-olive.svg?raw";

export function pathOf(source: string, id: string): string {
  const match = source.match(new RegExp(`id="${id}" d="([^"]+)"`));
  if (!match) throw new Error(`logo-olive.svg has no #${id} path`);
  return match[1];
}

export const logoPaths = {
  mark: pathOf(logoSource, "mark"),
  nameKo: pathOf(logoSource, "name-ko"),
  nameEn: pathOf(logoSource, "name-en"),
};
