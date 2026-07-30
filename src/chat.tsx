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
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelMessage } from "ai";
import { LaunchError } from "./components/launch-error";
import { createChatSystemPrompt } from "./domain/prompts";
import { resolveActiveModel, type ActiveModel, type Preferences } from "./domain/preferences";
import { getLaunchInputError, type LaunchInput } from "./lib/launch-input";
import { readLaunchInput } from "./lib/read-launch-input";
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

function FollowUpForm({ onSubmit }: { onSubmit: (text: string) => void }) {
  const { pop } = useNavigation();
  const [text, setText] = useState("");

  return (
    <Form
      navigationTitle="Follow Up"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Send Follow-Up"
            icon={Icon.ArrowRight}
            onSubmit={() => {
              if (!text.trim()) {
                void showToast({
                  style: Toast.Style.Failure,
                  title: "Enter a follow-up",
                });
                return;
              }
              pop();
              onSubmit(text.trim());
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="followUp"
        title="Follow-Up"
        placeholder="Add context, ask for more detail, or continue the conversation"
        value={text}
        onChange={setText}
        autoFocus
      />
    </Form>
  );
}

function ChatThread({
  initialQuestion,
  preferences,
  activeModel,
}: {
  initialQuestion: string;
  preferences: Preferences;
  activeModel: ActiveModel;
}) {
  const { push } = useNavigation();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const entriesRef = useRef<ChatEntry[]>([]);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const didStartRef = useRef(false);
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
        setIsLoading(false);
      }
    },
    [activeModel, preferences, systemPrompt, updateEntries],
  );

  const ask = useCallback(
    (question: string) => {
      if (isLoading) return;
      const history = [
        ...entriesRef.current,
        { id: createId(), role: "user" as const, content: question },
      ];
      updateEntries(history);
      void generate(history);
    },
    [generate, isLoading, updateEntries],
  );

  const retry = useCallback(() => {
    if (isLoading) return;
    const currentEntries = entriesRef.current;
    const history =
      currentEntries.at(-1)?.role === "assistant" ? currentEntries.slice(0, -1) : currentEntries;
    updateEntries(history);
    void generate(history);
  }, [generate, isLoading, updateEntries]);

  useEffect(() => {
    if (didStartRef.current) return;
    didStartRef.current = true;
    const initialEntries: ChatEntry[] = [
      { id: createId(), role: "user", content: initialQuestion },
    ];
    updateEntries(initialEntries);
    void generate(initialEntries);
  }, [generate, initialQuestion, updateEntries]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const latestAnswer = latestAssistantText(entries);
  const markdown = renderTranscript(entries, streamingText, error);

  return (
    <Detail
      navigationTitle="Chat Thread"
      markdown={markdown}
      isLoading={isLoading && !streamingText}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Provider" text={activeModel.provider} />
          <Detail.Metadata.Label title="Model" text={activeModel.model} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {isLoading ? (
            <Action
              title="Stop Generating"
              icon={Icon.Stop}
              onAction={() => abortControllerRef.current?.abort()}
            />
          ) : (
            <Action
              title="Follow up"
              icon={Icon.ArrowRight}
              onAction={() => push(<FollowUpForm onSubmit={ask} />)}
            />
          )}
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
    />
  );
}

type ChatLaunchProps = LaunchProps<{ arguments: Arguments.Chat }>;

export default function ChatCommand(props: ChatLaunchProps) {
  const preferences = getPreferenceValues<Preferences>();
  const [input, setInput] = useState<LaunchInput>();
  const [inputError, setInputError] = useState<string>();
  const [isResolvingInput, setIsResolvingInput] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    void readLaunchInput(props.arguments.question, props.fallbackText).then((resolvedInput) => {
      if (isCancelled) return;
      setInput(resolvedInput);
      setInputError(
        getLaunchInputError(resolvedInput, MAX_INITIAL_CHAT_LENGTH, "The initial question"),
      );
      setIsResolvingInput(false);
    });
    return () => {
      isCancelled = true;
    };
  }, [props.arguments.question, props.fallbackText]);

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
