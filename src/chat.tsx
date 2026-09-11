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
import { useCallback, useMemo, useRef, useState } from "react";
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

function renderTranscript(entries: ChatEntry[], streamingText: string, error?: string): string {
  const sections = entries.map((entry) => {
    const title = entry.role === "user" ? "You" : "Benben AI";
    return `## ${title}\n\n${entry.content}`;
  });

  if (streamingText) {
    sections.push(`## Benben AI\n\n${streamingText}`);
  }
  if (error) {
    sections.push(`> **Request failed:** ${error}`);
  }
  return sections.join("\n\n---\n\n");
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
  const followUpRef = useRef<Form.TextField>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
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
        controller.signal.throwIfAborted();
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
      if (isLoading || abortControllerRef.current || !question.trim()) return false;
      const history = [
        ...entriesRef.current,
        { id: createId(), role: "user" as const, content: question },
      ];
      updateEntries(history);
      void generate(history);
      return true;
    },
    [generate, isLoading, updateEntries],
  );

  const retry = useCallback(() => {
    if (isLoading || abortControllerRef.current) return;
    const currentEntries = entriesRef.current;
    const history =
      currentEntries.at(-1)?.role === "assistant" ? currentEntries.slice(0, -1) : currentEntries;
    updateEntries(history);
    void generate(history);
  }, [generate, isLoading, updateEntries]);

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
  const markdown = renderTranscript(entries, streamingText, error);

  return (
    <Form
      navigationTitle="Chat Thread"
      isLoading={isLoading}
      enableDrafts={false}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Send Follow-Up"
            icon={Icon.ArrowRight}
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onSubmit={() => {
              if (isLoading || !followUp.trim()) return;
              if (!ask(followUp.trim())) return;
              setFollowUp("");
              followUpRef.current?.focus();
            }}
          />
          {isLoading ? (
            <Action
              title="Stop Generating"
              icon={Icon.Stop}
              onAction={() => abortControllerRef.current?.abort()}
            />
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
          <Action.CopyToClipboard title="Copy Chat Thread" content={markdown} />
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
      {entries.map((entry) => (
        <Form.Description
          key={entry.id}
          title={entry.role === "user" ? "You" : "Benben AI"}
          text={entry.content}
        />
      ))}
      {streamingText ? <Form.Description title="Benben AI" text={streamingText} /> : null}
      {error ? <Form.Description title="Request Failed" text={error} /> : null}
      <Form.Description
        title="Provider / Model"
        text={`${activeModel.provider} / ${activeModel.model}`}
      />
      <Form.TextField
        id="followUp"
        title="Follow-Up"
        placeholder="Ask a follow-up · ⌘↵ to send"
        value={followUp}
        onChange={setFollowUp}
        ref={followUpRef}
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
