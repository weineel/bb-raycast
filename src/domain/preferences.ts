export type ModelProviderId = "openai" | "anthropic" | "openai-compatible";

export interface Preferences {
  defaultProvider: ModelProviderId;
  defaultOpenAIModel: string;
  defaultAnthropicModel: string;
  defaultCompatibleModel?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  compatibleBaseUrl?: string;
  compatibleApiKey?: string;
  googleApiKey?: string;
  baiduAppId?: string;
  baiduSecretKey?: string;
  defaultAnswerLanguage: string;
  defaultTargetLanguage: string;
  providerOverride: "global" | ModelProviderId;
  modelOverride?: string;
}

export interface ActiveModel {
  provider: ModelProviderId;
  model: string;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

function required(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ConfigurationError(`${label} is not configured. Open Command Preferences to add it.`);
  }
  return normalized;
}

export function resolveActiveModel(preferences: Preferences): ActiveModel {
  const provider =
    preferences.providerOverride === "global"
      ? preferences.defaultProvider
      : preferences.providerOverride;
  const override = preferences.modelOverride?.trim();

  if (override) {
    return { provider, model: override };
  }

  switch (provider) {
    case "openai":
      return { provider, model: required(preferences.defaultOpenAIModel, "OpenAI Model") };
    case "anthropic":
      return { provider, model: required(preferences.defaultAnthropicModel, "Anthropic Model") };
    case "openai-compatible":
      return {
        provider,
        model: required(preferences.defaultCompatibleModel, "OpenAI-Compatible Model"),
      };
  }
}

export function validateProviderCredentials(
  preferences: Preferences,
  provider: ModelProviderId,
): void {
  switch (provider) {
    case "openai":
      required(preferences.openaiApiKey, "OpenAI API Key");
      break;
    case "anthropic":
      required(preferences.anthropicApiKey, "Anthropic API Key");
      break;
    case "openai-compatible":
      required(preferences.compatibleBaseUrl, "OpenAI-Compatible Base URL");
      required(preferences.compatibleApiKey, "OpenAI-Compatible API Key");
      break;
  }
}
