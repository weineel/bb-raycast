import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  Keyboard,
  Toast,
  getPreferenceValues,
  openCommandPreferences,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelMessage } from "ai";
import { LANGUAGES, getLanguage, type LanguageId } from "./domain/languages";
import { createTranslationRequest, createTranslationSystemPrompt } from "./domain/prompts";
import { resolveActiveModel, type ActiveModel, type Preferences } from "./domain/preferences";
import { readDefaultInput } from "./lib/default-input";
import { getSafeErrorMessage, isAbortError } from "./lib/safe-error";
import { unicodeLength } from "./lib/text-length";
import { translateWithBaidu } from "./services/baidu-translate";
import { translateWithGoogle } from "./services/google-translate";
import { streamModelResponse } from "./services/model";

const MAX_SOURCE_LENGTH = 5_000;

type RequestStatus = "loading" | "success" | "error" | "unconfigured";

interface ReferenceResult {
  status: RequestStatus;
  text?: string;
  error?: string;
}

interface ModelRevision {
  id: string;
  instruction?: string;
  status: Exclude<RequestStatus, "unconfigured">;
  text?: string;
  error?: string;
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function referenceMarkdown(name: string, result: ReferenceResult): string {
  switch (result.status) {
    case "loading":
      return `## ${name}\n\n_Translating…_`;
    case "success":
      return `## ${name}\n\n${result.text}`;
    case "unconfigured":
      return `## ${name}\n\n> ${result.error}`;
    case "error":
      return `## ${name}\n\n> **Request failed:** ${result.error}`;
  }
}

function revisionsMarkdown(revisions: ModelRevision[], activeModel: ActiveModel): string {
  const content = revisions.map((revision, index) => {
    const title = index === 0 ? "Latest" : `Previous Revision ${revisions.length - index}`;
    const context = revision.instruction ? `\n\n_Context supplied: ${revision.instruction}_` : "";
    if (revision.status === "loading") {
      return `### ${title}\n\n${revision.text || "_Translating…_"}${context}`;
    }
    if (revision.status === "error") {
      return `### ${title}\n\n${revision.text || ""}\n\n> **Request failed:** ${revision.error}${context}`;
    }
    return `### ${title}\n\n${revision.text}${context}`;
  });

  return `## Model Translation\n\n_${activeModel.provider} · ${activeModel.model}_\n\n${content.join(
    "\n\n---\n\n",
  )}`;
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

function TranslateResult({
  sourceText,
  targetLanguage,
  preferences,
  activeModel,
}: {
  sourceText: string;
  targetLanguage: LanguageId;
  preferences: Preferences;
  activeModel: ActiveModel;
}) {
  const { push } = useNavigation();
  const [revisions, setRevisions] = useState<ModelRevision[]>([]);
  const [google, setGoogle] = useState<ReferenceResult>({ status: "loading" });
  const [baidu, setBaidu] = useState<ReferenceResult>({ status: "loading" });
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
    void runModel();
    void runGoogle();
    void runBaidu();
  }, [runBaidu, runGoogle, runModel]);

  useEffect(
    () => () => {
      modelAbortRef.current?.abort();
      googleAbortRef.current?.abort();
      baiduAbortRef.current?.abort();
    },
    [],
  );

  const latestRevision = revisions[0];
  const modelIsLoading = latestRevision?.status === "loading";
  const markdown = [
    revisionsMarkdown(revisions, activeModel),
    referenceMarkdown("Google Translation", google),
    referenceMarkdown("Baidu Translation", baidu),
  ].join("\n\n---\n\n");

  return (
    <Detail
      navigationTitle={`Translate to ${getLanguage(targetLanguage).label}`}
      markdown={markdown}
      isLoading={!revisions.length}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Target" text={getLanguage(targetLanguage).label} />
          <Detail.Metadata.Label title="Provider" text={activeModel.provider} />
          <Detail.Metadata.Label title="Model" text={activeModel.model} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
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
          {latestRevision?.text || google.text || baidu.text ? (
            <>
              <ActionPanel.Submenu title="Copy Translation" icon={Icon.Clipboard}>
                {latestRevision?.text ? (
                  <Action.CopyToClipboard
                    title="Copy Model Translation"
                    content={latestRevision.text}
                    shortcut={Keyboard.Shortcut.Common.Copy}
                  />
                ) : null}
                {google.text ? (
                  <Action.CopyToClipboard title="Copy Google Translation" content={google.text} />
                ) : null}
                {baidu.text ? (
                  <Action.CopyToClipboard title="Copy Baidu Translation" content={baidu.text} />
                ) : null}
              </ActionPanel.Submenu>
              <ActionPanel.Submenu title="Paste Translation" icon={Icon.TextCursor}>
                {latestRevision?.text ? (
                  <Action.Paste title="Paste Model Translation" content={latestRevision.text} />
                ) : null}
                {google.text ? (
                  <Action.Paste title="Paste Google Translation" content={google.text} />
                ) : null}
                {baidu.text ? (
                  <Action.Paste title="Paste Baidu Translation" content={baidu.text} />
                ) : null}
              </ActionPanel.Submenu>
            </>
          ) : null}
          {(!modelIsLoading && latestRevision) ||
          google.status !== "loading" ||
          baidu.status !== "loading" ? (
            <ActionPanel.Submenu title="Retry" icon={Icon.RotateClockwise}>
              {!modelIsLoading && latestRevision ? (
                <Action
                  title="Retry Model Translation"
                  onAction={() => void runModel(undefined, true)}
                />
              ) : null}
              {google.status !== "loading" ? (
                <Action title="Retry Google Translation" onAction={() => void runGoogle()} />
              ) : null}
              {baidu.status !== "loading" ? (
                <Action title="Retry Baidu Translation" onAction={() => void runBaidu()} />
              ) : null}
            </ActionPanel.Submenu>
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

export default function TranslateCommand() {
  const { push } = useNavigation();
  const preferences = getPreferenceValues<Preferences>();
  const [sourceText, setSourceText] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<LanguageId>(
    preferences.defaultTargetLanguage as LanguageId,
  );
  const didEditRef = useRef(false);
  const [inputError, setInputError] = useState<string>();
  const [activeModel, setActiveModel] = useState<ActiveModel>();
  const [configurationError, setConfigurationError] = useState<string>();

  useEffect(() => {
    try {
      setActiveModel(resolveActiveModel(preferences));
    } catch (error) {
      setConfigurationError(getSafeErrorMessage(error));
    }
  }, [preferences]);

  useEffect(() => {
    void readDefaultInput().then((text) => {
      if (!didEditRef.current) setSourceText(text);
    });
  }, []);

  function submit() {
    if (!sourceText.trim()) {
      setInputError("Enter text to translate.");
      return;
    }
    if (unicodeLength(sourceText) > MAX_SOURCE_LENGTH) {
      setInputError(
        `Source Text must be ${MAX_SOURCE_LENGTH.toLocaleString()} characters or fewer.`,
      );
      return;
    }
    if (!activeModel) {
      setInputError(configurationError || "Configure a model before translating.");
      return;
    }
    setInputError(undefined);
    push(
      <TranslateResult
        sourceText={sourceText}
        targetLanguage={targetLanguage}
        preferences={preferences}
        activeModel={activeModel}
      />,
    );
  }

  return (
    <Form
      navigationTitle="Translate"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Translate" icon={Icon.Globe} onSubmit={submit} />
          <Action
            title="Open Command Preferences"
            icon={Icon.Gear}
            onAction={openCommandPreferences}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="sourceText"
        title="Source Text"
        placeholder="Enter a word, sentence, or passage"
        value={sourceText}
        error={inputError}
        onChange={(value) => {
          didEditRef.current = true;
          setSourceText(value);
          if (inputError) setInputError(undefined);
        }}
        autoFocus
      />
      <Form.Dropdown
        id="targetLanguage"
        title="Target Language"
        value={targetLanguage}
        onChange={(value) => setTargetLanguage(value as LanguageId)}
      >
        {LANGUAGES.map((language) => (
          <Form.Dropdown.Item key={language.id} value={language.id} title={language.label} />
        ))}
      </Form.Dropdown>
      <Form.Description
        title="Model"
        text={
          activeModel
            ? `${activeModel.provider} · ${activeModel.model}`
            : configurationError || "Not configured"
        }
      />
    </Form>
  );
}
