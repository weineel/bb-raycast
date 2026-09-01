import { describe, expect, it } from "vitest";
import {
  createSourceTextPreview,
  createTranslationDetailMarkdown,
  createTranslationPageMarkdown,
  SOURCE_TEXT_PREVIEW_LENGTH,
  translationResultMarkdown,
} from "./translation-results";

describe("createSourceTextPreview", () => {
  it("collapses the Source Text to one line and truncates it by Unicode character", () => {
    expect(createSourceTextPreview("first line\n\nsecond line")).toBe("first line second line");
    expect(createSourceTextPreview("译".repeat(SOURCE_TEXT_PREVIEW_LENGTH + 1))).toBe(
      `${"译".repeat(SOURCE_TEXT_PREVIEW_LENGTH)}…`,
    );
  });
});

describe("createTranslationPageMarkdown", () => {
  it("places a Markdown-safe Source Text preview before the translations", () => {
    expect(
      createTranslationPageMarkdown("# Original\ntext", {
        model: { status: "success", text: "Translation" },
      }),
    ).toBe("\\# Original text\n\n---\n\n# Model Translation\n\nTranslation");
  });
});

describe("createTranslationDetailMarkdown", () => {
  it("lays out only configured translations in a stable order", () => {
    const markdown = createTranslationDetailMarkdown({
      model: { status: "loading" },
      google: { status: "success", text: "Google result" },
    });

    expect(markdown).toBe(
      "# Model Translation\n\n_Translating…_\n\n---\n\n# Google Translation\n\nGoogle result",
    );
    expect(markdown).not.toContain("Baidu Translation");
    expect(markdown).not.toContain("Source Text");
  });

  it("places each current result directly below its service title", () => {
    expect(
      createTranslationDetailMarkdown({
        model: { status: "loading", text: "Partial model result" },
        google: { status: "error", error: "Quota exceeded" },
        baidu: { status: "success", text: "Baidu result" },
      }),
    ).toBe(
      [
        "# Model Translation\n\nPartial model result",
        "# Google Translation\n\n# Request Failed\n\n> Quota exceeded",
        "# Baidu Translation\n\nBaidu result",
      ].join("\n\n---\n\n"),
    );
  });

  it("shows a service-neutral preferences guide when none are configured", () => {
    const markdown = createTranslationDetailMarkdown({});

    expect(markdown).toBe(
      "_No translation services are configured. Open Command Preferences to configure one._",
    );
    expect(markdown).not.toMatch(/Model|Google|Baidu/);
  });
});

describe("translationResultMarkdown", () => {
  it("keeps partial output visible while translation is streaming or fails", () => {
    expect(
      translationResultMarkdown({
        status: "loading",
        text: "## Translation\n\n**Partial** result",
      }),
    ).toBe("## Translation\n\n**Partial** result");
    expect(
      translationResultMarkdown({
        status: "error",
        text: "Partial result",
        error: "Generation stopped.",
      }),
    ).toContain("Partial result\n\n---\n\n# Request Failed");
  });

  it("renders loading, success, and error fallbacks", () => {
    expect(translationResultMarkdown({ status: "loading" })).toBe("_Translating…_");
    expect(translationResultMarkdown({ status: "success" })).toBe("_No translation returned._");
    expect(
      translationResultMarkdown({
        status: "error",
        error: "Quota exceeded",
      }),
    ).toBe("# Request Failed\n\n> Quota exceeded");
  });
});
