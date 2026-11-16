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

    const appCss = readFileSync(new URL("./styles/app.css", import.meta.url), "utf8");
    expect(appCss).toContain("var(--paper)");
    expect(appCss).toContain("var(--olive)");
    expect(appCss).toContain("var(--wash-sage)");
    expect(appCss).toContain("var(--wash-lavender)");
    expect(appCss).toContain("var(--font-serif)");
    expect(appCss).toContain("@media (max-width: 360px)");
    expect(appCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
