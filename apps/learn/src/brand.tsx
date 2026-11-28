import logoSource from "@design/logos/logo-olive.svg?raw";
import { Link } from "react-router";

export type LogoPaths = {
  mark: string;
  nameKo: string;
  nameEn: string;
};

function pathOf(id: string): string {
  const match = logoSource.match(new RegExp(`id="${id}" d="([^"]+)"`));
  if (!match?.[1]) throw new Error(`logo-olive.svg has no #${id} path`);
  return match[1];
}

export function logoPaths(): LogoPaths {
  return {
    mark: pathOf("mark"),
    nameKo: pathOf("name-ko"),
    nameEn: pathOf("name-en"),
  };
}

export function BrandMark() {
  const paths = logoPaths();

  return (
    <Link className="logo" to="/" aria-label="해온 소리 연습 첫 화면">
      <svg className="mark" viewBox="0 -1 241 180" aria-hidden="true" focusable="false">
        <path d={paths.mark} />
      </svg>
      <svg className="name" viewBox="12 201 190 142" aria-hidden="true" focusable="false">
        <path d={paths.nameKo} />
        <path d={paths.nameEn} />
      </svg>
    </Link>
  );
}
