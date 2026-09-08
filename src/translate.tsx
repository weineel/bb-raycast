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
import { MAX_SOURCE_TEXT_LENGTH } from "./domain/translation-session";
import {
  createTranslationPageMarkdown,
  translationResultMarkdown,
  type TranslationResultState,
  type TranslationResultStatus,
} from "./domain/translation-results";
import { resolveActiveModel, type ActiveModel, type Preferences } from "./domain/preferences";
import { useInitialRequest } from "./hooks/use-initial-request";
import { useLaunchInput } from "./hooks/use-launch-input";
import { getSafeErrorMessage, isAbortError } from "./lib/safe-error";
import { translateWithBaidu } from "./services/baidu-translate";
import { translateWithGoogle } from "./services/google-translate";
import { streamModelResponse } from "./services/model";
import { SpeechController } from "./services/speech";
import { SpeechAction, type SpeechActionProps } from "./components/speech-action";

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

const STATUS_PRESENTATION: Record<
  TranslationResultStatus,
  { label: string; color: Color; icon: Icon }
> = {
  loading: { label: "Translating", color: Color.Orange, icon: Icon.CircleProgress },
  success: { label: "Ready", color: Color.Green, icon: Icon.CheckCircle },
  error: { label: "Failed", color: Color.Red, icon: Icon.XMarkCircle },
  unconfigured: {
    label: "Not Configured",
    color: Color.SecondaryText,
    icon: Icon.Gear,
  },
};

function resultMetadata(
  status: TranslationResultStatus,
  targetLanguage: LanguageId,
  extra?: React.ReactNode,
) {
  const presentation = STATUS_PRESENTATION[status];
  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label
        title="Status"
        text={{ value: presentation.label, color: presentation.color }}
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

function SourceTextDetail({ sourceText, speech, accent }: SpeechActionProps) {
  return (
    <Detail
      navigationTitle="Source Text"
      markdown={sourceText}
      actions={
        <ActionPanel>
          <SpeechAction sourceText={sourceText} speech={speech} accent={accent} />
          <Action.CopyToClipboard
            title="Copy Source Text"
            content={sourceText}
            shortcut={Keyboard.Shortcut.Common.Copy}
          />
        </ActionPanel>
      }
    />
  );
}

function TranslationRevisions({
  revisions,
  targetLanguage,
  activeModel,
}: {
  revisions: ModelRevision[];
  targetLanguage: LanguageId;
  activeModel: ActiveModel;
}) {
  return (
    <List navigationTitle="Translation Revisions" isShowingDetail>
      {revisions.map((revision, index) => {
        const revisionNumber = revisions.length - index;
        const result: TranslationResultState = revision;
        const presentation = STATUS_PRESENTATION[revision.status];
        return (
          <List.Item
            key={revision.id}
            id={revision.id}
            title={`Revision ${revisionNumber}`}
            subtitle={revision.instruction || "Initial translation"}
            icon={{
              source: presentation.icon,
              tintColor: presentation.color,
            }}
            accessories={[
              {
                tag: {
                  value: presentation.label,
                  color: presentation.color,
                },
              },
            ]}
            detail={
              <List.Item.Detail
                markdown={translationResultMarkdown(result)}
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

export function TranslateResult({
  sourceText,
  targetLanguage,
  preferences,
  activeModel,
}: {
  sourceText: string;
  targetLanguage: LanguageId;
  preferences: Preferences;
  activeModel?: ActiveModel;
}) {
  const { push } = useNavigation();
  const [speech] = useState(() => new SpeechController());
  const accent = preferences.speechEnglishAccent ?? "en-US";
  useEffect(() => () => speech.stop(), [speech]);
  const hasGoogleTranslation = !!preferences.googleApiKey?.trim();
  const hasBaiduTranslation =
    !!preferences.baiduAppId?.trim() && !!preferences.baiduSecretKey?.trim();
  const [revisions, setRevisions] = useState<ModelRevision[]>([]);
  const [google, setGoogle] = useState<TranslationResultState>({
    status: hasGoogleTranslation ? "loading" : "unconfigured",
  });
  const [baidu, setBaidu] = useState<TranslationResultState>({
    status: hasBaiduTranslation ? "loading" : "unconfigured",
  });
  const modelMessagesRef = useRef<ModelMessage[]>([
    { role: "user", content: createTranslationRequest(sourceText) },
  ]);
  const modelAbortRef = useRef<AbortController | undefined>(undefined);
  const googleAbortRef = useRef<AbortController | undefined>(undefined);
  const baiduAbortRef = useRef<AbortController | undefined>(undefined);
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

  const startInitialRequests = useCallback(() => {
    if (activeModel) void runModel();
    if (hasGoogleTranslation) void runGoogle();
    if (hasBaiduTranslation) void runBaidu();
  }, [activeModel, hasBaiduTranslation, hasGoogleTranslation, runBaidu, runGoogle, runModel]);

  const stopRequests = useCallback(() => {
    modelAbortRef.current?.abort();
    googleAbortRef.current?.abort();
    baiduAbortRef.current?.abort();
  }, []);
  useInitialRequest(startInitialRequests, stopRequests);

  const latestRevision = revisions[0];
  const model: TranslationResultState = latestRevision || { status: "loading" };
  const detailMarkdown = createTranslationPageMarkdown(sourceText, {
    ...(activeModel ? { model } : {}),
    ...(hasGoogleTranslation ? { google } : {}),
    ...(hasBaiduTranslation ? { baidu } : {}),
  });
  const isLoading =
    (activeModel && model.status === "loading") ||
    (hasGoogleTranslation && google.status === "loading") ||
    (hasBaiduTranslation && baidu.status === "loading");

  function modelActions() {
    const modelIsLoading = model.status === "loading";
    return (
      <>
        {modelIsLoading ? (
          <Action
            title="Stop Model Translation"
            icon={Icon.Stop}
            onAction={() => modelAbortRef.current?.abort()}
          />
        ) : (
          <Action
            title="Refine Model Translation"
            icon={Icon.ArrowRight}
            onAction={() => push(<FollowUpForm onSubmit={(text) => void runModel(text)} />)}
          />
        )}
        {latestRevision?.text ? (
          <>
            <Action.CopyToClipboard title="Copy Model Translation" content={latestRevision.text} />
            <Action.Paste title="Paste Model Translation" content={latestRevision.text} />
          </>
        ) : null}
        {!modelIsLoading && latestRevision ? (
          <Action
            title="Retry Model Translation"
            icon={Icon.RotateClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={() => void runModel(undefined, true)}
          />
        ) : null}
        {revisions.length > 1 && activeModel ? (
          <Action
            title="View Translation Revisions"
            icon={Icon.Clock}
            onAction={() =>
              push(
                <TranslationRevisions
                  revisions={revisions}
                  targetLanguage={targetLanguage}
                  activeModel={activeModel}
                />,
              )
            }
          />
        ) : null}
      </>
    );
  }

  function referenceActions(
    title: string,
    result: TranslationResultState,
    retry: () => Promise<void>,
  ) {
    return (
      <>
        {result.text ? (
          <>
            <Action.CopyToClipboard title={`Copy ${title}`} content={result.text} />
            <Action.Paste title={`Paste ${title}`} content={result.text} />
          </>
        ) : null}
        {result.status === "success" || result.status === "error" ? (
          <Action
            title={`Retry ${title}`}
            icon={Icon.RotateClockwise}
            onAction={() => void retry()}
          />
        ) : null}
      </>
    );
  }

  return (
    <Detail
      navigationTitle={`Translate to ${getLanguage(targetLanguage).label}`}
      isLoading={isLoading}
      markdown={detailMarkdown}
      actions={
        <ActionPanel>
          <Action
            title="View Full Source Text"
            icon={Icon.Eye}
            onAction={() =>
              push(<SourceTextDetail sourceText={sourceText} speech={speech} accent={accent} />)
            }
          />
          <SpeechAction sourceText={sourceText} speech={speech} accent={accent} />
          {activeModel ? modelActions() : null}
          {hasGoogleTranslation ? referenceActions("Google Translation", google, runGoogle) : null}
          {hasBaiduTranslation ? referenceActions("Baidu Translation", baidu, runBaidu) : null}
          <Action.CopyToClipboard
            title="Copy Source Text"
            content={sourceText}
            shortcut={Keyboard.Shortcut.Common.Copy}
          />
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

type TranslateLaunchProps = LaunchProps<{
  arguments: Arguments.Translate;
  launchContext?: { translationSessionId?: string };
}>;

export default function TranslateCommand(props: TranslateLaunchProps) {
  const preferences = getPreferenceValues<Preferences>();
  const {
    input,
    error: inputError,
    isLoading: isResolvingInput,
  } = useLaunchInput({
    argumentText: props.arguments.sourceText,
    fallbackText: props.fallbackText,
    maxLength: MAX_SOURCE_TEXT_LENGTH,
    label: "Source Text",
  });

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
  try {
    activeModel = resolveActiveModel(preferences);
  } catch {
    activeModel = undefined;
  }

  const targetLanguage = getLanguage(
    props.arguments.targetLanguage || preferences.defaultTargetLanguage,
  ).id;

  return (
    <TranslateResult
      key={props.launchContext?.translationSessionId}
      sourceText={input.text}
      targetLanguage={targetLanguage}
      preferences={preferences}
      activeModel={activeModel}
    />
  );
}
