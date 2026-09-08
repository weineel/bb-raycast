/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Default Model Provider - Used unless a command overrides it */
  "defaultProvider": "openai" | "anthropic" | "openai-compatible",
  /** OpenAI Model - Global OpenAI model ID */
  "defaultOpenAIModel": string,
  /** Anthropic Model - Global Anthropic model ID */
  "defaultAnthropicModel": string,
  /** OpenAI-Compatible Model - Global model ID for the compatible endpoint */
  "defaultCompatibleModel"?: string,
  /** OpenAI API Key - Sent directly to OpenAI when it is the active provider */
  "openaiApiKey"?: string,
  /** Anthropic API Key - Sent directly to Anthropic when it is the active provider */
  "anthropicApiKey"?: string,
  /** OpenAI-Compatible Base URL - API root for the compatible provider */
  "compatibleBaseUrl"?: string,
  /** OpenAI-Compatible API Key - Sent directly to the configured compatible provider */
  "compatibleApiKey"?: string,
  /** Google Cloud Translation API Key - Optional. Enables the Google reference translation. */
  "googleApiKey"?: string,
  /** Baidu Translate APP ID - Optional. Used together with the Baidu Secret Key. */
  "baiduAppId"?: string,
  /** Baidu Translate Secret Key - Optional. Used together with the Baidu APP ID. */
  "baiduSecretKey"?: string,
  /** Default Answer Language - The language Chat normally responds in */
  "defaultAnswerLanguage": "zh-CN" | "zh-TW" | "en" | "ja" | "ko" | "fr" | "de" | "es" | "pt" | "it" | "ru" | "ar" | "th" | "vi" | "id" | "ms" | "hi",
  /** Default Translation Target - Initially selected by the Translate command */
  "defaultTargetLanguage": "zh-CN" | "zh-TW" | "en" | "ja" | "ko" | "fr" | "de" | "es" | "pt" | "it" | "ru" | "ar" | "th" | "vi" | "id" | "ms" | "hi",
  /** English Reading Accent - English accent for local Source Text speech. Requires an installed macOS voice for the selected accent. */
  "speechEnglishAccent": "en-US" | "en-GB"
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `chat` command */
  export type Chat = ExtensionPreferences & {
  /** Model Provider - Override the global provider for Chat */
  "providerOverride": "global" | "openai" | "anthropic" | "openai-compatible",
  /** Model ID - Optional model override for Chat */
  "modelOverride"?: string
}
  /** Preferences accessible in the `quick-translate` command */
  export type QuickTranslate = ExtensionPreferences & {}
  /** Preferences accessible in the `translate` command */
  export type Translate = ExtensionPreferences & {
  /** Model Provider - Override the global provider for Translate */
  "providerOverride": "global" | "openai" | "anthropic" | "openai-compatible",
  /** Model ID - Optional model override for Translate */
  "modelOverride"?: string
}
}

declare namespace Arguments {
  /** Arguments passed to the `chat` command */
  export type Chat = {
  /** Question or term */
  "question": string
}
  /** Arguments passed to the `quick-translate` command */
  export type QuickTranslate = {}
  /** Arguments passed to the `translate` command */
  export type Translate = {
  /** Text to translate */
  "sourceText": string,
  /** Target language */
  "targetLanguage": "zh-CN" | "zh-TW" | "en" | "ja" | "ko" | "fr" | "de" | "es" | "pt" | "it" | "ru" | "ar" | "th" | "vi" | "id" | "ms" | "hi"
}
}

