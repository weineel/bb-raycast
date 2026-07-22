import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, type ModelMessage } from "ai";
import type { ActiveModel, Preferences } from "../domain/preferences";
import { validateProviderCredentials } from "../domain/preferences";

interface StreamModelOptions {
  activeModel: ActiveModel;
  preferences: Preferences;
  system: string;
  messages: ModelMessage[];
  signal: AbortSignal;
  onText: (text: string) => void;
}

function createModel(activeModel: ActiveModel, preferences: Preferences) {
  validateProviderCredentials(preferences, activeModel.provider);

  switch (activeModel.provider) {
    case "openai":
      return createOpenAI({ apiKey: preferences.openaiApiKey?.trim() })(activeModel.model);
    case "anthropic":
      return createAnthropic({ apiKey: preferences.anthropicApiKey?.trim() })(activeModel.model);
    case "openai-compatible":
      return createOpenAICompatible({
        name: "custom",
        baseURL: preferences.compatibleBaseUrl!.trim().replace(/\/+$/, ""),
        apiKey: preferences.compatibleApiKey!.trim(),
      })(activeModel.model);
  }
}

export async function streamModelResponse({
  activeModel,
  preferences,
  system,
  messages,
  signal,
  onText,
}: StreamModelOptions): Promise<string> {
  const result = streamText({
    model: createModel(activeModel, preferences),
    system,
    messages,
    abortSignal: signal,
    maxRetries: 0,
  });

  let completeText = "";
  for await (const delta of result.textStream) {
    completeText += delta;
    onText(completeText);
  }

  if (!completeText.trim() && !signal.aborted) {
    throw new Error("The model returned an empty response.");
  }
  return completeText;
}
