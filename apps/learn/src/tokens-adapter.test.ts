import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const designRoot = fileURLToPath(new URL("../../../src/design-system", import.meta.url));

describe("design token adapter", () => {
  it("imports the current design system instead of copying a palette", () => {
    const adapter = readFileSync(new URL("./styles/tokens-adapter.ts", import.meta.url), "utf8");
    expect(adapter).toContain("@design/tokens.css");
    expect(adapter).toContain("@design/base.css");

    const tokens = readFileSync(`${designRoot}/tokens.css`, "utf8");
    const base = readFileSync(`${designRoot}/base.css`, "utf8");
    expect(tokens).toContain("--paper: #fefcf3");
    expect(tokens).toContain("--olive: #4c4f2c");
    expect(tokens).toContain("--wash-sage: #eeefde");
    expect(tokens).toContain("--wash-lavender: #eee6f0");
    expect(tokens).toContain("Noto Serif KR");
    expect(base).toContain("background: var(--paper)");
    expect(base).toContain("font-family: var(--font-serif)");

    const styles = ["shared.css", "practice.css", "teacher.css", "responsive.css"]
      .map((name) => readFileSync(new URL(`./styles/${name}`, import.meta.url), "utf8"))
      .join("\n");
    expect(styles).toContain("var(--paper)");
    expect(styles).toContain("var(--olive)");
    expect(styles).toContain("var(--wash-sage)");
    expect(styles).toContain("var(--wash-lavender)");
    expect(styles).toContain("var(--font-serif)");
    expect(styles).toContain("@media (max-width: 360px)");
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const minWidths = [...styles.matchAll(/min-width:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(minWidths.every((width) => width <= 180)).toBe(true);
    expect(styles).toContain("minmax(0, 1fr)");
    expect(styles).toContain("overflow-wrap: anywhere");
  });
});
