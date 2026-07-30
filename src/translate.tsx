import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Form,
  Icon,
  Keyboard,
  LaunchProps,
  List,
  Toast,
  getPreferenceValues,
  openCommandPreferences,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelMessage } from "ai";
import { LaunchError } from "./components/launch-error";
import { getLanguage, type LanguageId } from "./domain/languages";
import { createTranslationRequest, createTranslationSystemPrompt } from "./domain/prompts";
import {
  createTranslationRows,
  type TranslationResultState,
  type TranslationResultStatus,
  type TranslationRowId,
} from "./domain/translation-results";
import { resolveActiveModel, type ActiveModel, type Preferences } from "./domain/preferences";
import { getLaunchInputError, type LaunchInput } from "./lib/launch-input";
import { readLaunchInput } from "./lib/read-launch-input";
import { getSafeErrorMessage, isAbortError } from "./lib/safe-error";
import { translateWithBaidu } from "./services/baidu-translate";
import { translateWithGoogle } from "./services/google-translate";
import { streamModelResponse } from "./services/model";

const MAX_SOURCE_LENGTH = 5_000;

interface ModelRevision {
  id: string;
  instruction?: string;
  status: Exclude<TranslationResultStatus, "unconfigured">;
  text?: string;
  error?: string;
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function statusLabel(status: TranslationResultStatus): string {
  switch (status) {
    case "loading":
      return "Translating";
    case "success":
      return "Ready";
    case "error":
      return "Failed";
    case "unconfigured":
      return "Not Configured";
  }
}

function statusColor(status: TranslationResultStatus): Color {
  switch (status) {
    case "loading":
      return Color.Orange;
    case "success":
      return Color.Green;
    case "error":
      return Color.Red;
    case "unconfigured":
      return Color.SecondaryText;
  }
}

function statusIcon(status: TranslationResultStatus): Icon {
  switch (status) {
    case "loading":
      return Icon.CircleProgress;
    case "success":
      return Icon.CheckCircle;
    case "error":
      return Icon.XMarkCircle;
    case "unconfigured":
      return Icon.Gear;
  }
}

function resultMarkdown(result: TranslationResultState): string {
  switch (result.status) {
    case "loading":
      return "_Translating…_";
    case "success":
      return result.text || "_No translation returned._";
    case "error":
      return `# Request Failed\n\n> ${result.error || "The request failed."}`;
    case "unconfigured":
      return `# Not Configured\n\n${result.error || "Open Command Preferences to configure this service."}`;
  }
}

function resultMetadata(
  status: TranslationResultStatus,
  targetLanguage: LanguageId,
  extra?: React.ReactNode,
) {
  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label
        title="Status"
        text={{ value: statusLabel(status), color: statusColor(status) }}
      />
      <List.Item.Detail.Metadata.Label
        title="Target Language"
        text={getLanguage(targetLanguage).label}
      />
      {extra}
    </List.Item.Detail.Metadata>
  );
}

function FollowUpForm({ onSubmit }: { onSubmit: (instruction: string) => void }) {
  const { pop } = useNavigation();
  const [instruction, setInstruction] = useState("");

  return (
    <Form
      navigationTitle="Refine Translation"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Refine Translation"
            icon={Icon.ArrowRight}
            onSubmit={() => {
              if (!instruction.trim()) {
                void showToast({
                  style: Toast.Style.Failure,
                  title: "Enter context or a revision request",
                });
                return;
              }
              pop();
              onSubmit(instruction.trim());
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="instruction"
        title="Context or Request"
        placeholder="Add usage context, clarify a term, or request a different style"
        value={instruction}
        onChange={setInstruction}
        autoFocus
      />
      <Form.Description
        title="Scope"
        text="This refines the original Source Text. It does not change the target language."
      />
    </Form>
  );
}

function RevisionHistory({
  revisions,
  targetLanguage,
  activeModel,
}: {
  revisions: ModelRevision[];
  targetLanguage: LanguageId;
  activeModel: ActiveModel;
}) {
  return (
    <List navigationTitle="Revision History" isShowingDetail>
      {revisions.map((revision, index) => {
        const revisionNumber = revisions.length - index;
        const result: TranslationResultState = revision;
        return (
          <List.Item
            key={revision.id}
            id={revision.id}
            title={`Revision ${revisionNumber}`}
            subtitle={revision.instruction || "Initial translation"}
            icon={{
              source: statusIcon(revision.status),
              tintColor: statusColor(revision.status),
            }}
            accessories={[
              {
                tag: {
                  value: statusLabel(revision.status),
                  color: statusColor(revision.status),
                },
              },
            ]}
            detail={
              <List.Item.Detail
                markdown={resultMarkdown(result)}
                metadata={resultMetadata(
                  revision.status,
                  targetLanguage,
                  <>
                    <List.Item.Detail.Metadata.Label title="Provider" text={activeModel.provider} />
                    <List.Item.Detail.Metadata.Label title="Model" text={activeModel.model} />
                    <List.Item.Detail.Metadata.Label
                      title="Revision"
                      text={`${revisionNumber} of ${revisions.length}`}
                    />
                  </>,
                )}
              />
            }
            actions={
              revision.text ? (
                <ActionPanel>
                  <Action.CopyToClipboard
                    title="Copy Revision"
                    content={revision.text}
                    shortcut={Keyboard.Shortcut.Common.Copy}
                  />
                  <Action.Paste title="Paste Revision" content={revision.text} />
                </ActionPanel>
              ) : undefined
            }
          />
        );
      })}
    </List>
  );
}

function TranslateResult({
  sourceText,
  targetLanguage,
  preferences,
  activeModel,
  modelConfigurationError,
}: {
  sourceText: string;
  targetLanguage: LanguageId;
  preferences: Preferences;
  activeModel?: ActiveModel;
  modelConfigurationError?: string;
}) {
  const { push } = useNavigation();
  const [selectedItemId, setSelectedItemId] = useState<TranslationRowId>("model");
  const [revisions, setRevisions] = useState<ModelRevision[]>([]);
  const [google, setGoogle] = useState<TranslationResultState>({ status: "loading" });
  const [baidu, setBaidu] = useState<TranslationResultState>({ status: "loading" });
  const modelMessagesRef = useRef<ModelMessage[]>([
    { role: "user", content: createTranslationRequest(sourceText) },
  ]);
  const modelAbortRef = useRef<AbortController | undefined>(undefined);
  const googleAbortRef = useRef<AbortController | undefined>(undefined);
  const baiduAbortRef = useRef<AbortController | undefined>(undefined);
  const didStartRef = useRef(false);
  const systemPrompt = useMemo(
    () => createTranslationSystemPrompt(targetLanguage),
    [targetLanguage],
  );

  const updateRevision = useCallback((id: string, update: Partial<ModelRevision>) => {
    setRevisions((current) =>
      current.map((revision) => (revision.id === id ? { ...revision, ...update } : revision)),
    );
  }, []);

  const runModel = useCallback(
    async (instruction?: string, retry = false) => {
      if (!activeModel) return;

      modelAbortRef.current?.abort();
      const controller = new AbortController();
      modelAbortRef.current = controller;

      let history = modelMessagesRef.current;
      let revisionId: string;
      if (retry && revisions[0]) {
        revisionId = revisions[0].id;
        history = history.at(-1)?.role === "assistant" ? history.slice(0, -1) : history;
        modelMessagesRef.current = history;
        updateRevision(revisionId, { status: "loading", text: "", error: undefined });
      } else {
        revisionId = createId();
        if (instruction) {
          history = [...history, { role: "user", content: instruction }];
          modelMessagesRef.current = history;
        }
        setRevisions((current) => [{ id: revisionId, instruction, status: "loading" }, ...current]);
      }

      let partialText = "";
      try {
        const completeText = await streamModelResponse({
          activeModel,
          preferences,
          system: systemPrompt,
          messages: history,
          signal: controller.signal,
          onText(text) {
            partialText = text;
            updateRevision(revisionId, { text });
          },
        });
        modelMessagesRef.current = [...history, { role: "assistant", content: completeText }];
        updateRevision(revisionId, { status: "success", text: completeText });
      } catch (requestError) {
        updateRevision(revisionId, {
          status: "error",
          text: partialText,
          error: isAbortError(requestError)
            ? "Generation stopped."
            : getSafeErrorMessage(requestError),
        });
      }
    },
    [activeModel, preferences, revisions, systemPrompt, updateRevision],
  );

  const runGoogle = useCallback(async () => {
    googleAbortRef.current?.abort();
    const apiKey = preferences.googleApiKey?.trim();
    if (!apiKey) {
      setGoogle({
        status: "unconfigured",
        error: "Google Cloud Translation API Key is not configured.",
      });
      return;
    }
    const controller = new AbortController();
    googleAbortRef.current = controller;
    setGoogle({ status: "loading" });
    try {
      const text = await translateWithGoogle(sourceText, targetLanguage, apiKey, controller.signal);
      setGoogle({ status: "success", text });
    } catch (error) {
      if (!isAbortError(error)) {
        setGoogle({ status: "error", error: getSafeErrorMessage(error) });
      }
    }
  }, [preferences.googleApiKey, sourceText, targetLanguage]);

  const runBaidu = useCallback(async () => {
    baiduAbortRef.current?.abort();
    const appId = preferences.baiduAppId?.trim();
    const secretKey = preferences.baiduSecretKey?.trim();
    if (!appId || !secretKey) {
      setBaidu({
        status: "unconfigured",
        error: "Baidu Translate APP ID and Secret Key are not configured.",
      });
      return;
    }
    const controller = new AbortController();
    baiduAbortRef.current = controller;
    setBaidu({ status: "loading" });
    try {
      const text = await translateWithBaidu(
        sourceText,
        targetLanguage,
        appId,
        secretKey,
        controller.signal,
      );
      setBaidu({ status: "success", text });
    } catch (error) {
      if (!isAbortError(error)) {
        setBaidu({ status: "error", error: getSafeErrorMessage(error) });
      }
    }
  }, [preferences.baiduAppId, preferences.baiduSecretKey, sourceText, targetLanguage]);

  useEffect(() => {
    if (didStartRef.current) return;
    didStartRef.current = true;
    if (activeModel) void runModel();
    void runGoogle();
    void runBaidu();
  }, [activeModel, runBaidu, runGoogle, runModel]);

  useEffect(
    () => () => {
      modelAbortRef.current?.abort();
      googleAbortRef.current?.abort();
      baiduAbortRef.current?.abort();
    },
    [],
  );

  const latestRevision = revisions[0];
  const model: TranslationResultState = latestRevision
    ? latestRevision
    : activeModel
      ? { status: "loading" }
      : {
          status: "unconfigured",
          error: modelConfigurationError || "The selected Model Provider is not configured.",
        };
  const rows = createTranslationRows({
    model,
    google,
    baidu,
    sourceText,
    revisionCount: revisions.length,
  });
  const isLoading = rows.some((row) => row.status === "loading");

  function modelActions() {
    const modelIsLoading = model.status === "loading";
    return (
      <ActionPanel>
        {modelIsLoading && activeModel ? (
          <Action
            title="Stop Model Translation"
            icon={Icon.Stop}
            onAction={() => modelAbortRef.current?.abort()}
          />
        ) : activeModel ? (
          <Action
            title="Refine Model Translation"
            icon={Icon.ArrowRight}
            onAction={() => push(<FollowUpForm onSubmit={(text) => void runModel(text)} />)}
          />
        ) : (
          <Action
            title="Open Command Preferences"
            icon={Icon.Gear}
            onAction={openCommandPreferences}
          />
        )}
        {latestRevision?.text ? (
          <>
            <Action.CopyToClipboard
              title="Copy Model Translation"
              content={latestRevision.text}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
            <Action.Paste title="Paste Model Translation" content={latestRevision.text} />
          </>
        ) : null}
        {!modelIsLoading && latestRevision && activeModel ? (
          <Action
            title="Retry Model Translation"
            icon={Icon.RotateClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={() => void runModel(undefined, true)}
          />
        ) : null}
        {revisions.length > 1 && activeModel ? (
          <Action
            title="View Revision History"
            icon={Icon.Clock}
            onAction={() =>
              push(
                <RevisionHistory
                  revisions={revisions}
                  targetLanguage={targetLanguage}
                  activeModel={activeModel}
                />,
              )
            }
          />
        ) : null}
        {activeModel ? (
          <Action
            title="Open Command Preferences"
            icon={Icon.Gear}
            onAction={openCommandPreferences}
          />
        ) : null}
      </ActionPanel>
    );
  }

  function referenceActions(
    title: string,
    result: TranslationResultState,
    retry: () => Promise<void>,
  ) {
    return (
      <ActionPanel>
        {result.status === "unconfigured" ? (
          <Action
            title="Open Command Preferences"
            icon={Icon.Gear}
            onAction={openCommandPreferences}
          />
        ) : result.text ? (
          <>
            <Action.CopyToClipboard
              title={`Copy ${title}`}
              content={result.text}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
            <Action.Paste title={`Paste ${title}`} content={result.text} />
          </>
        ) : null}
        {result.status === "error" ? (
          <Action
            title={`Retry ${title}`}
            icon={Icon.RotateClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={() => void retry()}
          />
        ) : null}
        {result.status !== "unconfigured" ? (
          <Action
            title="Open Command Preferences"
            icon={Icon.Gear}
            onAction={openCommandPreferences}
          />
        ) : null}
      </ActionPanel>
    );
  }

  return (
    <List
      navigationTitle={`Translate to ${getLanguage(targetLanguage).label}`}
      searchBarPlaceholder="Filter translation results"
      isShowingDetail
      isLoading={isLoading}
      selectedItemId={selectedItemId}
      onSelectionChange={(id) => {
        if (id) setSelectedItemId(id as TranslationRowId);
      }}
    >
      <List.Section title="Translations">
        {rows.slice(0, 3).map((row) => {
          const result = row.id === "model" ? model : row.id === "google" ? google : baidu;
          const isModel = row.id === "model";
          const icon =
            row.id === "model" ? Icon.Stars : row.id === "google" ? Icon.Globe : Icon.SpeechBubble;
          const tintColor =
            row.id === "model" ? Color.Purple : row.id === "google" ? Color.Blue : Color.Orange;
          const actions =
            row.id === "model"
              ? modelActions()
              : row.id === "google"
                ? referenceActions("Google Translation", google, runGoogle)
                : referenceActions("Baidu Translation", baidu, runBaidu);

          return (
            <List.Item
              key={row.id}
              id={row.id}
              title={row.title}
              subtitle={row.preview}
              icon={{ source: icon, tintColor }}
              accessories={[
                ...(row.revisionLabel ? [{ text: row.revisionLabel }] : []),
                {
                  tag: {
                    value: statusLabel(row.status),
                    color: statusColor(row.status),
                  },
                  icon: statusIcon(row.status),
                },
              ]}
              detail={
                <List.Item.Detail
                  markdown={resultMarkdown(result)}
                  metadata={resultMetadata(
                    result.status,
                    targetLanguage,
                    isModel && activeModel ? (
                      <>
                        <List.Item.Detail.Metadata.Label
                          title="Provider"
                          text={activeModel.provider}
                        />
                        <List.Item.Detail.Metadata.Label title="Model" text={activeModel.model} />
                        <List.Item.Detail.Metadata.Label
                          title="Revision"
                          text={`${Math.max(revisions.length, 1)}`}
                        />
                      </>
                    ) : undefined,
                  )}
                />
              }
              actions={actions}
            />
          );
        })}
      </List.Section>
      <List.Section title="Input">
        <List.Item
          id="source"
          title="Source Text"
          subtitle={rows[3].preview}
          icon={{ source: Icon.Document, tintColor: Color.SecondaryText }}
          accessories={[{ text: `${Array.from(sourceText).length.toLocaleString()} characters` }]}
          detail={
            <List.Item.Detail
              markdown={`# Source Text\n\n${sourceText}`}
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label
                    title="Target Language"
                    text={getLanguage(targetLanguage).label}
                  />
                </List.Item.Detail.Metadata>
              }
            />
          }
          actions={
            <ActionPanel>
              <Action.CopyToClipboard
                title="Copy Source Text"
                content={sourceText}
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

type TranslateLaunchProps = LaunchProps<{ arguments: Arguments.Translate }>;

export default function TranslateCommand(props: TranslateLaunchProps) {
  const preferences = getPreferenceValues<Preferences>();
  const [input, setInput] = useState<LaunchInput>();
  const [inputError, setInputError] = useState<string>();
  const [isResolvingInput, setIsResolvingInput] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    void readLaunchInput(props.arguments.sourceText, props.fallbackText).then((resolvedInput) => {
      if (isCancelled) return;
      setInput(resolvedInput);
      setInputError(getLaunchInputError(resolvedInput, MAX_SOURCE_LENGTH, "Source Text"));
      setIsResolvingInput(false);
    });
    return () => {
      isCancelled = true;
    };
  }, [props.arguments.sourceText, props.fallbackText]);

  if (isResolvingInput) {
    return (
      <Detail navigationTitle="Translate" markdown="# Translate\n\nResolving input…" isLoading />
    );
  }

  if (inputError || !input) {
    return (
      <LaunchError
        title={inputError === "No Input Found" ? "No Input Found" : "Cannot Translate"}
        message={
          inputError === "No Input Found"
            ? "Enter the first command argument, select text, or copy text before running Translate."
            : inputError || "No Source Text is available."
        }
      />
    );
  }

  let activeModel: ActiveModel | undefined;
  let modelConfigurationError: string | undefined;
  try {
    activeModel = resolveActiveModel(preferences);
  } catch (error) {
    modelConfigurationError = getSafeErrorMessage(error);
  }

  const targetLanguage = getLanguage(
    props.arguments.targetLanguage || preferences.defaultTargetLanguage,
  ).id;

  return (
    <TranslateResult
      sourceText={input.text}
      targetLanguage={targetLanguage}
      preferences={preferences}
      activeModel={activeModel}
      modelConfigurationError={modelConfigurationError}
    />
  );
}
