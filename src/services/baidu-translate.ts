import { createHash, randomUUID } from "node:crypto";
import { getLanguage, type LanguageId } from "../domain/languages";

interface BaiduTranslationResponse {
  trans_result?: Array<{ dst?: string }>;
  dict?: string;
  error_code?: string;
  error_msg?: string;
}

function parseBaiduPhonetics(dict: string | undefined): string {
  if (!dict) return "";

  try {
    const dictionary = JSON.parse(dict);
    const symbols = dictionary?.word_result?.simple_means?.symbols;
    if (!Array.isArray(symbols)) return "";

    return symbols
      .map((symbol) =>
        [
          ["英", symbol?.ph_en],
          ["美", symbol?.ph_am],
        ]
          .flatMap(([label, value]) =>
            typeof value === "string" && value.trim() ? [`${label} /${value.trim()}/`] : [],
          )
          .join(" · "),
      )
      .filter(Boolean)
      .join("\n\n");
  } catch {
    // Optional dictionary data must not prevent displaying a successful translation.
    return "";
  }
}

export function createBaiduSignature(
  appId: string,
  sourceText: string,
  salt: string,
  secretKey: string,
): string {
  return createHash("md5").update(`${appId}${sourceText}${salt}${secretKey}`).digest("hex");
}

export function parseBaiduTranslation(payload: BaiduTranslationResponse): string {
  const translatedText = payload.trans_result
    ?.map((translation) => translation.dst?.trim())
    .filter(Boolean)
    .join("\n");

  if (!translatedText) {
    const detail = payload.error_msg
      ? `${payload.error_msg}${payload.error_code ? ` (${payload.error_code})` : ""}`
      : "Baidu Translation returned no result.";
    throw new Error(detail);
  }
  const phonetics = parseBaiduPhonetics(payload.dict);
  return phonetics ? `${translatedText}\n\n${phonetics}` : translatedText;
}

export async function translateWithBaidu(
  sourceText: string,
  targetLanguage: LanguageId,
  appId: string,
  secretKey: string,
  signal: AbortSignal,
): Promise<string> {
  const salt = randomUUID();
  const body = new URLSearchParams({
    q: sourceText,
    from: "auto",
    to: getLanguage(targetLanguage).baidu,
    appid: appId.trim(),
    salt,
    sign: createBaiduSignature(appId.trim(), sourceText, salt, secretKey.trim()),
  });

  const response = await fetch("https://fanyi-api.baidu.com/api/trans/vip/translate", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal,
  });
  const payload = (await response.json()) as BaiduTranslationResponse;
  if (!response.ok) {
    throw new Error(`Baidu Translation failed (${response.status}).`);
  }
  return parseBaiduTranslation(payload);
}
