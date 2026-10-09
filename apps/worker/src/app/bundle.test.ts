import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Le worker empaqueté lit `restore.lua` à côté de lui (`import.meta.url` y est `dist/`) : sans cette copie, il ne démarre pas.
// Une preuve en local l'a montré le 08/10 (JOURNAL 2026-10-08) ; le gateway fait de même pour tous ses scripts.
describe("the worker bundle (JOURNAL 2026-10-08)", () => {
  it("copies restore.lua next to main.js, from a file that exists", () => {
    const config = readFileSync(new URL("../../tsup.config.ts", import.meta.url), "utf8");

    expect(config).toContain("packages/redis-core/src/restore.lua");
    expect(config).toContain("dist/restore.lua");
    expect(existsSync(new URL("../../../../packages/redis-core/src/restore.lua", import.meta.url))).toBe(
      true,
    );
  });
});
