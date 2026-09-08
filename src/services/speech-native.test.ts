import { describe, expect, it } from "vitest";
import { detectSpeechLanguage } from "./speech";

describe.skipIf(process.platform !== "darwin")("macOS Source Text language recognition", () => {
  it.each([
    ["apple", "en"],
    ["cat", "en"],
    ["dog", "en"],
    ["test", "en"],
    ["a", "en"],
    ["bonjour", "fr"],
    ["こんにちは", "ja"],
    ["这是一段中文，包含 hello。", "zh-Hans"],
    ["This is an English sentence with 中文 inside.", "en"],
  ])("recognizes %s without synthesizing audio", async (sourceText, language) => {
    expect(await detectSpeechLanguage(sourceText, new AbortController().signal)).toBe(language);
  });
});
