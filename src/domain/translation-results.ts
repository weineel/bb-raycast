export type TranslationResultStatus = "loading" | "success" | "error" | "unconfigured";
export type TranslationRowId = "model" | "google" | "baidu" | "source";

export interface TranslationResultState {
  status: TranslationResultStatus;
  text?: string;
  error?: string;
}

export interface TranslationRow {
  id: TranslationRowId;
  title: string;
  status: TranslationResultStatus;
  preview: string;
  revisionLabel?: string;
}

function createPreview(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resultPreview(result: TranslationResultState): string {
  switch (result.status) {
    case "loading":
      return "Translating…";
    case "success":
      return createPreview(result.text) || "Ready";
    case "error":
      return createPreview(result.error) || "Request failed";
    case "unconfigured":
      return createPreview(result.error) || "Not configured";
  }
}

export function createTranslationRows(input: {
  model: TranslationResultState;
  google: TranslationResultState;
  baidu: TranslationResultState;
  sourceText: string;
  revisionCount: number;
}): TranslationRow[] {
  return [
    {
      id: "model",
      title: "Model Translation",
      status: input.model.status,
      preview: resultPreview(input.model),
      ...(input.revisionCount > 0 ? { revisionLabel: `Revision ${input.revisionCount}` } : {}),
    },
    {
      id: "google",
      title: "Google Translation",
      status: input.google.status,
      preview: resultPreview(input.google),
    },
    {
      id: "baidu",
      title: "Baidu Translation",
      status: input.baidu.status,
      preview: resultPreview(input.baidu),
    },
    {
      id: "source",
      title: "Source Text",
      status: "success",
      preview: createPreview(input.sourceText),
    },
  ];
}
