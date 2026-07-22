import { describe, expect, it } from "vitest";
import { LANGUAGES, getLanguage } from "./languages";

describe("languages", () => {
  it("provides Google and Baidu codes for every supported target", () => {
    expect(LANGUAGES).toHaveLength(17);
    for (const language of LANGUAGES) {
      expect(language.google).toBeTruthy();
      expect(language.baidu).toBeTruthy();
    }
  });

  it("falls back to Simplified Chinese for an unknown preference", () => {
    expect(getLanguage("unknown").id).toBe("zh-CN");
  });
});
