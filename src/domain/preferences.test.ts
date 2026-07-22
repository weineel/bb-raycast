import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  resolveActiveModel,
  validateProviderCredentials,
  type Preferences,
} from "./preferences";

function preferences(overrides: Partial<Preferences> = {}): Preferences {
  return {
    defaultProvider: "openai",
    defaultOpenAIModel: "gpt-default",
    defaultAnthropicModel: "claude-default",
    defaultCompatibleModel: "custom-default",
    openaiApiKey: "openai-key",
    anthropicApiKey: "anthropic-key",
    compatibleBaseUrl: "https://example.com/v1",
    compatibleApiKey: "custom-key",
    defaultAnswerLanguage: "zh-CN",
    defaultTargetLanguage: "zh-CN",
    providerOverride: "global",
    ...overrides,
  };
}

describe("model preferences", () => {
  it("uses the global provider and its model by default", () => {
    expect(resolveActiveModel(preferences())).toEqual({
      provider: "openai",
      model: "gpt-default",
    });
  });

  it("supports command-level provider and model overrides", () => {
    expect(
      resolveActiveModel(
        preferences({ providerOverride: "anthropic", modelOverride: "claude-command" }),
      ),
    ).toEqual({ provider: "anthropic", model: "claude-command" });
  });

  it("does not silently fall back when credentials are missing", () => {
    expect(() => validateProviderCredentials(preferences({ openaiApiKey: "" }), "openai")).toThrow(
      ConfigurationError,
    );
  });
});
