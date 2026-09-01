export type TranslationResultStatus = "loading" | "success" | "error" | "unconfigured";

export interface TranslationResultState {
  status: TranslationResultStatus;
  text?: string;
  error?: string;
}

export interface TranslationDetailResults {
  model?: TranslationResultState;
  google?: TranslationResultState;
  baidu?: TranslationResultState;
}

export const SOURCE_TEXT_PREVIEW_LENGTH = 48;

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_[\]{}()<>#+\-.!|])/g, "\\$1");
}

export function createSourceTextPreview(sourceText: string): string {
  const oneLine = sourceText.replace(/\s+/g, " ").trim();
  const characters = Array.from(oneLine);
  if (characters.length <= SOURCE_TEXT_PREVIEW_LENGTH) return oneLine;
  return `${characters.slice(0, SOURCE_TEXT_PREVIEW_LENGTH).join("")}…`;
}

export function translationResultMarkdown(result: TranslationResultState): string {
  switch (result.status) {
    case "loading":
      return result.text || "_Translating…_";
    case "success":
      return result.text || "_No translation returned._";
    case "error": {
      const error = `# Request Failed\n\n> ${result.error || "The request failed."}`;
      return result.text ? `${result.text}\n\n---\n\n${error}` : error;
    }
    case "unconfigured":
      return `# Not Configured\n\n${result.error || "Open Command Preferences to configure this service."}`;
  }
}

export function createTranslationDetailMarkdown(results: TranslationDetailResults): string {
  const sections = [
    results.model ? { title: "Model Translation", result: results.model } : undefined,
    results.google ? { title: "Google Translation", result: results.google } : undefined,
    results.baidu ? { title: "Baidu Translation", result: results.baidu } : undefined,
  ].filter((section): section is { title: string; result: TranslationResultState } => !!section);

  if (sections.length === 0) {
    return "_No translation services are configured. Open Command Preferences to configure one._";
  }

  return sections
    .map(({ title, result }) => `# ${title}\n\n${translationResultMarkdown(result)}`)
    .join("\n\n---\n\n");
}

export function createTranslationPageMarkdown(
  sourceText: string,
  results: TranslationDetailResults,
): string {
  const sourcePreview = escapeMarkdownText(createSourceTextPreview(sourceText));
  return `${sourcePreview}\n\n---\n\n${createTranslationDetailMarkdown(results)}`;
}
