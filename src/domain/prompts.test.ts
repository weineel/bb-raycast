import { describe, expect, it } from "vitest";
import { createChatSystemPrompt, createTranslationSystemPrompt } from "./prompts";

describe("system prompts", () => {
  it("classifies only the first Chat message as a possible Bare Term", () => {
    const prompt = createChatSystemPrompt("zh-CN");
    expect(prompt).toContain("Bare Term");
    expect(prompt).toContain("first user message only");
    expect(prompt).toContain("Do not reclassify them as Bare Terms");
    expect(prompt).toContain("Simplified Chinese");
  });

  it("keeps translation follow-ups scoped to the original source and target", () => {
    const prompt = createTranslationSystemPrompt("ja");
    expect(prompt).toContain("professional Model Translation");
    expect(prompt).toContain("brief explanation");
    expect(prompt).toContain("not new text to translate");
    expect(prompt).toContain("Keep the Source Text and target language unchanged");
    expect(prompt).toContain("Japanese");
  });
});
