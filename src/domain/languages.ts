export const LANGUAGES = [
  { id: "zh-CN", label: "Simplified Chinese", google: "zh-CN", baidu: "zh" },
  { id: "zh-TW", label: "Traditional Chinese", google: "zh-TW", baidu: "cht" },
  { id: "en", label: "English", google: "en", baidu: "en" },
  { id: "ja", label: "Japanese", google: "ja", baidu: "jp" },
  { id: "ko", label: "Korean", google: "ko", baidu: "kor" },
  { id: "fr", label: "French", google: "fr", baidu: "fra" },
  { id: "de", label: "German", google: "de", baidu: "de" },
  { id: "es", label: "Spanish", google: "es", baidu: "spa" },
  { id: "pt", label: "Portuguese", google: "pt", baidu: "pt" },
  { id: "it", label: "Italian", google: "it", baidu: "it" },
  { id: "ru", label: "Russian", google: "ru", baidu: "ru" },
  { id: "ar", label: "Arabic", google: "ar", baidu: "ara" },
  { id: "th", label: "Thai", google: "th", baidu: "th" },
  { id: "vi", label: "Vietnamese", google: "vi", baidu: "vie" },
  { id: "id", label: "Indonesian", google: "id", baidu: "id" },
  { id: "ms", label: "Malay", google: "ms", baidu: "may" },
  { id: "hi", label: "Hindi", google: "hi", baidu: "hi" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

export function getLanguage(id: string) {
  return LANGUAGES.find((language) => language.id === id) ?? LANGUAGES[0];
}
