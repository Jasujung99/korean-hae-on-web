import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { logoPaths } from "./brand";

describe("logo adapter", () => {
  it("uses the mark and name paths from the real olive logo", () => {
    const paths = logoPaths();
    const svg = readFileSync(
      fileURLToPath(new URL("../../../src/design-system/logos/logo-olive.svg", import.meta.url)),
      "utf8",
    );
    expect(svg).toContain(`id="mark" d="${paths.mark}"`);
    expect(svg).toContain(`id="name-ko" d="${paths.nameKo}"`);
    expect(svg).toContain(`id="name-en" d="${paths.nameEn}"`);
  });
});
