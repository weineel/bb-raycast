import { describe, expect, it } from "vitest";
import { createTranslationRows } from "./translation-results";

describe("createTranslationRows", () => {
  it("keeps Model, Google, Baidu, and Source Text in a stable order", () => {
    const rows = createTranslationRows({
      model: { status: "loading" },
      google: { status: "success", text: "Google result" },
      baidu: { status: "unconfigured", error: "Not configured" },
      sourceText: "Original text",
      revisionCount: 0,
    });

    expect(rows.map((row) => row.id)).toEqual(["model", "google", "baidu", "source"]);
  });

  it("creates concise previews and exposes the latest model revision count", () => {
    const rows = createTranslationRows({
      model: { status: "success", text: "## Translation\n\n**Hello** world" },
      google: { status: "loading" },
      baidu: { status: "error", error: "Quota\nexceeded" },
      sourceText: "Original\ntext",
      revisionCount: 2,
    });

    expect(rows).toEqual([
      {
        id: "model",
        title: "Model Translation",
        status: "success",
        preview: "Translation Hello world",
        revisionLabel: "Revision 2",
      },
      {
        id: "google",
        title: "Google Translation",
        status: "loading",
        preview: "Translating…",
      },
      {
        id: "baidu",
        title: "Baidu Translation",
        status: "error",
        preview: "Quota exceeded",
      },
      {
        id: "source",
        title: "Source Text",
        status: "success",
        preview: "Original text",
      },
    ]);
  });
});
