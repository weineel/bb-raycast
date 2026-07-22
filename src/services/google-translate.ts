import { getLanguage, type LanguageId } from "../domain/languages";

interface GoogleTranslationResponse {
  data?: {
    translations?: Array<{ translatedText?: string }>;
  };
  error?: {
    message?: string;
  };
}

export function decodeHtmlEntities(text: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };

  return text.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (entity, code: string) => {
    let codePoint: number | undefined;
    if (code.startsWith("#x") || code.startsWith("#X")) {
      codePoint = Number.parseInt(code.slice(2), 16);
    } else if (code.startsWith("#")) {
      codePoint = Number.parseInt(code.slice(1), 10);
    }
    if (codePoint !== undefined) {
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }

    return namedEntities[code.toLowerCase()] ?? entity;
  });
}

export function parseGoogleTranslation(payload: GoogleTranslationResponse): string {
  const translatedText = payload.data?.translations
    ?.map((translation) =>
      translation.translatedText
        ? decodeHtmlEntities(translation.translatedText).trim()
        : undefined,
    )
    .filter(Boolean)
    .join("\n");

  if (!translatedText) {
    throw new Error(payload.error?.message || "Google Translation returned no result.");
  }
  return translatedText;
}

export async function translateWithGoogle(
  sourceText: string,
  targetLanguage: LanguageId,
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch("https://translation.googleapis.com/language/translate/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey.trim(),
    },
    body: JSON.stringify({
      q: sourceText,
      target: getLanguage(targetLanguage).google,
      format: "text",
    }),
    signal,
  });
  const payload = (await response.json()) as GoogleTranslationResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Google Translation failed (${response.status}).`);
  }
  return parseGoogleTranslation(payload);
}
