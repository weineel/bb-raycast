import { StrictMode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveModel, Preferences } from "./domain/preferences";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const requestStats = vi.hoisted(() => ({
  modelStarted: 0,
  modelCompleted: 0,
  googleStarted: 0,
  googleCompleted: 0,
  baiduStarted: 0,
  baiduCompleted: 0,
}));

vi.mock("@raycast/api", () => {
  const Component = () => null;
  const Action = Object.assign(Component, {
    CopyToClipboard: Component,
    Paste: Component,
    SubmitForm: Component,
  });
  const ActionPanel = Object.assign(Component, { Submenu: Component });
  const Detail = Object.assign(Component, {
    Metadata: Object.assign(Component, { Label: Component }),
  });
  const Form = Object.assign(Component, {
    Description: Component,
    TextArea: Component,
  });
  const List = Object.assign(Component, {
    Item: Object.assign(Component, {
      Detail: Object.assign(Component, {
        Metadata: Object.assign(Component, { Label: Component }),
      }),
    }),
    Section: Component,
  });

  return {
    Action,
    ActionPanel,
    Color: {
      Blue: "blue",
      Green: "green",
      Orange: "orange",
      Purple: "purple",
      Red: "red",
      SecondaryText: "secondary",
    },
    Detail,
    Form,
    Icon: new Proxy({}, { get: (_, property) => String(property) }),
    Keyboard: { Shortcut: { Common: { Copy: {}, Refresh: {} } } },
    List,
    Toast: { Style: { Failure: "failure" } },
    getPreferenceValues: vi.fn(),
    openCommandPreferences: vi.fn(),
    showToast: vi.fn(),
    useNavigation: () => ({ pop: vi.fn(), push: vi.fn() }),
  };
});

function abortableResult(
  signal: AbortSignal,
  result: string,
  complete: () => void,
  onText?: (text: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })),
      { once: true },
    );
    setTimeout(() => {
      if (signal.aborted) return;
      onText?.(result);
      complete();
      resolve(result);
    }, 1);
  });
}

vi.mock("./services/model", () => ({
  streamModelResponse: vi.fn(
    ({ signal, onText }: { signal: AbortSignal; onText: (text: string) => void }) => {
      requestStats.modelStarted += 1;
      return abortableResult(
        signal,
        "Model result",
        () => {
          requestStats.modelCompleted += 1;
        },
        onText,
      );
    },
  ),
}));

vi.mock("./services/google-translate", () => ({
  translateWithGoogle: vi.fn(
    (_source: string, _target: string, _key: string, signal: AbortSignal) => {
      requestStats.googleStarted += 1;
      return abortableResult(signal, "Google result", () => {
        requestStats.googleCompleted += 1;
      });
    },
  ),
}));

vi.mock("./services/baidu-translate", () => ({
  translateWithBaidu: vi.fn(
    (_source: string, _target: string, _appId: string, _secret: string, signal: AbortSignal) => {
      requestStats.baiduStarted += 1;
      return abortableResult(signal, "Baidu result", () => {
        requestStats.baiduCompleted += 1;
      });
    },
  ),
}));

import { ChatThread } from "./chat";
import { TranslateResult } from "./translate";

const activeModel: ActiveModel = { provider: "openai", model: "test-model" };
const preferences: Preferences = {
  defaultProvider: "openai",
  defaultOpenAIModel: "test-model",
  defaultAnthropicModel: "test-model",
  openaiApiKey: "test-key",
  googleApiKey: "test-google-key",
  baiduAppId: "test-baidu-id",
  baiduSecretKey: "test-baidu-secret",
  defaultAnswerLanguage: "zh-CN",
  defaultTargetLanguage: "zh-CN",
  providerOverride: "global",
};

async function renderStrictMode(element: React.ReactElement): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<StrictMode>{element}</StrictMode>);
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  return renderer!;
}

describe("initial requests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(requestStats, {
      modelStarted: 0,
      modelCompleted: 0,
      googleStarted: 0,
      googleCompleted: 0,
      baiduStarted: 0,
      baiduCompleted: 0,
    });
  });

  it("completes the initial Chat request after a Strict Mode effect replay", async () => {
    const renderer = await renderStrictMode(
      <ChatThread initialQuestion="hello" preferences={preferences} activeModel={activeModel} />,
    );

    expect(requestStats.modelStarted).toBe(1);
    expect(requestStats.modelCompleted).toBe(1);
    renderer.unmount();
  });

  it("completes the initial Translate requests after a Strict Mode effect replay", async () => {
    const renderer = await renderStrictMode(
      <TranslateResult
        sourceText="hello"
        targetLanguage="zh-CN"
        preferences={preferences}
        activeModel={activeModel}
      />,
    );

    expect(requestStats.modelStarted).toBe(1);
    expect(requestStats.modelCompleted).toBe(1);
    expect(requestStats.googleStarted).toBe(1);
    expect(requestStats.googleCompleted).toBe(1);
    expect(requestStats.baiduStarted).toBe(1);
    expect(requestStats.baiduCompleted).toBe(1);
    renderer.unmount();
  });
});
