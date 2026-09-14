import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  Keyboard,
  LaunchProps,
  getPreferenceValues,
  openCommandPreferences,
} from "@raycast/api";
import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import type { ModelMessage } from "ai";
import { LaunchError } from "./components/launch-error";
import { createChatSystemPrompt } from "./domain/prompts";
import { resolveActiveModel, type ActiveModel, type Preferences } from "./domain/preferences";
import { useInitialRequest } from "./hooks/use-initial-request";
import { useLaunchInput } from "./hooks/use-launch-input";
import { getSafeErrorMessage, isAbortError } from "./lib/safe-error";
import { streamModelResponse } from "./services/model";

const MAX_INITIAL_CHAT_LENGTH = 20_000;

interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toModelMessages(entries: ChatEntry[]): ModelMessage[] {
  return entries.map(({ role, content }) => ({ role, content }));
}

function latestAssistantText(entries: ChatEntry[]): string | undefined {
  return entries.findLast((entry) => entry.role === "assistant")?.content;
}

export function ChatThread({
  initialQuestion,
  preferences,
  activeModel,
}: {
  initialQuestion: string;
  preferences: Preferences;
  activeModel: ActiveModel;
}) {
  const [followUp, setFollowUp] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const entriesRef = useRef<ChatEntry[]>([]);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const systemPrompt = useMemo(
    () => createChatSystemPrompt(preferences.defaultAnswerLanguage),
    [preferences.defaultAnswerLanguage],
  );

  const updateEntries = useCallback((nextEntries: ChatEntry[]) => {
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
  }, []);

  const generate = useCallback(
    async (history: ChatEntry[]) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setError(undefined);
      setStreamingText("");
      setIsLoading(true);
      let partialText = "";

      try {
        const completeText = await streamModelResponse({
          activeModel,
          preferences,
          system: systemPrompt,
          messages: toModelMessages(history),
          signal: controller.signal,
          onText(text) {
            partialText = text;
            setStreamingText(text);
          },
        });
        updateEntries([...history, { id: createId(), role: "assistant", content: completeText }]);
        setStreamingText("");
      } catch (requestError) {
        if (partialText) {
          updateEntries([...history, { id: createId(), role: "assistant", content: partialText }]);
          setStreamingText("");
        }
        setError(
          isAbortError(requestError) ? "Generation stopped." : getSafeErrorMessage(requestError),
        );
      } finally {
        abortControllerRef.current = undefined;
        setIsLoading(false);
      }
    },
    [activeModel, preferences, systemPrompt, updateEntries],
  );

  const ask = useCallback(
    (question: string) => {
      if (abortControllerRef.current) return false;
      const text = question.trim();
      if (!text) return false;
      const history = [
        ...entriesRef.current,
        { id: createId(), role: "user" as const, content: text },
      ];
      updateEntries(history);
      void generate(history);
      return true;
    },
    [generate, updateEntries],
  );

  const retry = useCallback(() => {
    if (abortControllerRef.current) return;
    const currentEntries = entriesRef.current;
    const history =
      currentEntries.at(-1)?.role === "assistant" ? currentEntries.slice(0, -1) : currentEntries;
    updateEntries(history);
    void generate(history);
  }, [generate, updateEntries]);

  const startInitialRequest = useCallback(() => {
    const initialEntries: ChatEntry[] = [
      { id: createId(), role: "user", content: initialQuestion },
    ];
    updateEntries(initialEntries);
    void generate(initialEntries);
  }, [generate, initialQuestion, updateEntries]);

  const stopRequest = useCallback(() => abortControllerRef.current?.abort(), []);
  useInitialRequest(startInitialRequest, stopRequest);

  const latestAnswer = latestAssistantText(entries);

  return (
    <Form
      navigationTitle="Chat Thread"
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Send Follow-Up"
            icon={Icon.ArrowRight}
            shortcut={{ modifiers: [], key: "return" }}
            onSubmit={() => {
              if (ask(followUp)) setFollowUp("");
            }}
          />
          {isLoading ? (
            <Action title="Stop Generating" icon={Icon.Stop} onAction={stopRequest} />
          ) : null}
          {latestAnswer ? (
            <>
              <Action.CopyToClipboard
                title="Copy Latest Answer"
                content={latestAnswer}
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
              <Action.Paste title="Paste Latest Answer" content={latestAnswer} />
            </>
          ) : null}
          {!isLoading ? (
            <Action title="Retry Latest Answer" icon={Icon.RotateClockwise} onAction={retry} />
          ) : null}
          <Action
            title="Open Command Preferences"
            icon={Icon.Gear}
            onAction={openCommandPreferences}
          />
        </ActionPanel>
      }
    >
      {entries.map((entry, index) => (
        <Fragment key={entry.id}>
          {entry.role === "user" && index > 0 ? <Form.Separator /> : null}
          <Form.Description
            text={`${entry.role === "user" ? "You" : "Benben AI"}\n\n${entry.content}`}
          />
        </Fragment>
      ))}
      {isLoading ? (
        <Form.Description key="streaming" text={`Benben AI\n\n${streamingText || "Generating…"}`} />
      ) : null}
      {error ? <Form.Description key="error" text={`Request Status\n\n${error}`} /> : null}
      <Form.Separator />
      <Form.Description key="model" text={`${activeModel.provider} · ${activeModel.model}`} />
      <Form.TextArea
        key="followUp"
        id="followUp"
        title="Follow-Up"
        placeholder="Add context, ask for more detail, or continue the conversation"
        value={followUp}
        onChange={setFollowUp}
        autoFocus
      />
    </Form>
  );
}

type ChatLaunchProps = LaunchProps<{ arguments: Arguments.Chat }>;

export default function ChatCommand(props: ChatLaunchProps) {
  const preferences = getPreferenceValues<Preferences>();
  const {
    input,
    error: inputError,
    isLoading: isResolvingInput,
  } = useLaunchInput({
    argumentText: props.arguments.question,
    fallbackText: props.fallbackText,
    maxLength: MAX_INITIAL_CHAT_LENGTH,
    label: "The initial question",
  });

  if (isResolvingInput) {
    return <Detail navigationTitle="Chat" markdown="# Chat\n\nResolving input…" isLoading />;
  }

  if (inputError || !input) {
    return (
      <LaunchError
        title={inputError === "No Input Found" ? "No Input Found" : "Cannot Start Chat"}
        message={
          inputError === "No Input Found"
            ? "Enter the first command argument, select text, or copy text before running Chat."
            : inputError || "No input is available."
        }
      />
    );
  }

  let activeModel: ActiveModel;
  try {
    activeModel = resolveActiveModel(preferences);
  } catch (error) {
    return (
      <LaunchError
        title="Model Not Configured"
        message={getSafeErrorMessage(error)}
        showPreferences
      />
    );
  }

  return (
    <ChatThread
      initialQuestion={input.text.trim()}
      preferences={preferences}
      activeModel={activeModel}
    />
  );
}
