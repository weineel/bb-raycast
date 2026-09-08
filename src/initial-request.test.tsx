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

const raycast = vi.hoisted(() => ({
  getPreferenceValues: vi.fn(),
}));

const navigation = vi.hoisted(() => ({
  pop: vi.fn(),
  push: vi.fn(),
}));

const speechCommands = vi.hoisted(
  () =>
    [] as Array<{
      signal: AbortSignal;
      finish: (error: Error | null, stdout: string) => void;
    }>,
);
vi.mock("node:child_process", () => ({
  execFile: vi.fn((_file, _args, options, callback) => {
    speechCommands.push({ signal: options.signal, finish: callback });
    return { stdin: { end: vi.fn(), on: vi.fn() } };
  }),
}));

const renderStats = vi.hoisted(() => ({
  itemIds: [] as string[],
  detailMarkdowns: [] as string[],
  actionTitles: [] as string[],
  actionHandlers: [] as Array<{ title: string; onAction?: () => void; shortcut?: unknown }>,
  detailLoading: [] as boolean[],
}));

vi.mock("@raycast/api", () => {
  const Component = () => null;
  const Container = ({ children }: { children?: React.ReactNode }) => children ?? null;
  const ActionComponent = ({
    title,
    onAction,
    shortcut,
  }: {
    title?: string;
    onAction?: () => void;
    shortcut?: unknown;
  }) => {
    if (title) {
      renderStats.actionTitles.push(title);
      renderStats.actionHandlers.push({ title, onAction, shortcut });
    }
    return null;
  };
  const Action = Object.assign(ActionComponent, {
    CopyToClipboard: ActionComponent,
    Paste: ActionComponent,
    SubmitForm: ActionComponent,
  });
  const ActionPanel = Object.assign(Container, { Submenu: Container });
  const DetailComponent = ({
    markdown,
    actions,
    isLoading,
  }: {
    markdown?: string;
    actions?: React.ReactNode;
    isLoading?: boolean;
  }) => {
    if (markdown) {
      renderStats.detailMarkdowns.push(markdown);
    }
    renderStats.detailLoading.push(!!isLoading);
    return actions ?? null;
  };
  const Detail = Object.assign(DetailComponent, {
    Metadata: Object.assign(Component, { Label: Component }),
  });
  const Form = Object.assign(Component, {
    Description: Component,
    TextArea: Component,
  });
  const ListItem = ({
    id,
    detail,
    actions,
  }: {
    id?: string;
    detail?: React.ReactElement<{ markdown?: string }>;
    actions?: React.ReactNode;
  }) => {
    if (id) renderStats.itemIds.push(id);
    if (detail?.props.markdown) renderStats.detailMarkdowns.push(detail.props.markdown);
    return (
      <>
        {detail}
        {actions}
      </>
    );
  };
  const ListContainer = ({ children }: { children?: React.ReactNode }) => children ?? null;
  const List = Object.assign(ListContainer, {
    Item: Object.assign(ListItem, {
      Detail: Object.assign(Component, {
        Metadata: Object.assign(Component, { Label: Component }),
      }),
    }),
    Section: Container,
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
    getPreferenceValues: raycast.getPreferenceValues,
    openCommandPreferences: vi.fn(),
    showToast: vi.fn(),
    useNavigation: () => navigation,
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
import TranslateCommand, { TranslateResult } from "./translate";

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

function translateCommandProps(
  translationSessionId: string,
  sourceText = "hello",
): Parameters<typeof TranslateCommand>[0] {
  return {
    arguments: { sourceText, targetLanguage: "zh-CN" },
    launchContext: { translationSessionId },
    launchType: "userInitiated" as never,
  };
}

describe("initial requests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    raycast.getPreferenceValues.mockReturnValue(preferences);
    navigation.pop.mockClear();
    navigation.push.mockClear();
    renderStats.itemIds.length = 0;
    renderStats.detailMarkdowns.length = 0;
    renderStats.actionTitles.length = 0;
    renderStats.actionHandlers.length = 0;
    renderStats.detailLoading.length = 0;
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

  it("renders one Detail with a Source Text preview and all configured translations", async () => {
    const renderer = await renderStrictMode(
      <TranslateResult
        sourceText="hello"
        targetLanguage="zh-CN"
        preferences={preferences}
        activeModel={activeModel}
      />,
    );

    expect(renderStats.itemIds).toEqual([]);
    expect(renderStats.detailMarkdowns.at(-1)).toBe(
      [
        "hello",
        "# Model Translation\n\nModel result",
        "# Google Translation\n\nGoogle result",
        "# Baidu Translation\n\nBaidu result",
      ].join("\n\n---\n\n"),
    );
    expect(renderStats.detailLoading).toContain(true);
    expect(renderStats.detailLoading.at(-1)).toBe(false);
    expect(renderStats.actionTitles).toContain("View Full Source Text");
    renderer.unmount();
  });

  it("opens the full Source Text from the preview action", async () => {
    const sourceText = "first line\nsecond line";
    const renderer = await renderStrictMode(
      <TranslateResult
        sourceText={sourceText}
        targetLanguage="zh-CN"
        preferences={preferences}
        activeModel={activeModel}
      />,
    );
    const viewSource = renderStats.actionHandlers.findLast(
      (action) => action.title === "View Full Source Text",
    );

    await act(async () => viewSource?.onAction?.());
    expect(navigation.push).toHaveBeenCalledOnce();

    let sourceRenderer: ReactTestRenderer | undefined;
    await act(async () => {
      sourceRenderer = create(navigation.push.mock.lastCall?.[0]);
    });
    expect(renderStats.detailMarkdowns.at(-1)).toBe(sourceText);
    sourceRenderer?.unmount();
    renderer.unmount();
  });

  it("hides unconfigured translations from the first render and their actions", async () => {
    const unconfiguredPreferences: Preferences = {
      ...preferences,
      googleApiKey: " ",
      baiduAppId: "configured-id",
      baiduSecretKey: "",
    };
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <TranslateResult
          sourceText="hello"
          targetLanguage="zh-CN"
          preferences={unconfiguredPreferences}
        />,
      );
    });

    expect(renderStats.itemIds).toEqual([]);
    expect(renderStats.detailMarkdowns).toEqual([
      [
        "hello",
        "_No translation services are configured. Open Command Preferences to configure one._",
      ].join("\n\n---\n\n"),
    ]);
    expect(new Set(renderStats.actionTitles)).toEqual(
      new Set([
        "View Full Source Text",
        "Read Source Text",
        "Copy Source Text",
        "Open Command Preferences",
      ]),
    );
    expect(requestStats.modelStarted).toBe(0);
    expect(requestStats.googleStarted).toBe(0);
    expect(requestStats.baiduStarted).toBe(0);
    expect(renderStats.detailLoading.at(-1)).toBe(false);
    renderer?.unmount();
  });

  it("starts a new Translation Session when the launch context changes", async () => {
    const renderer = await renderStrictMode(
      <TranslateCommand {...translateCommandProps("session-1")} />,
    );

    expect(requestStats.modelStarted).toBe(1);
    expect(requestStats.googleStarted).toBe(1);
    expect(requestStats.baiduStarted).toBe(1);

    await act(async () => {
      renderer.update(
        <StrictMode>
          <TranslateCommand {...translateCommandProps("session-2")} />
        </StrictMode>,
      );
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(requestStats.modelStarted).toBe(2);
    expect(requestStats.googleStarted).toBe(2);
    expect(requestStats.baiduStarted).toBe(2);
    renderer.unmount();
  });

  it("shares speech across the result and source pages and stops when the session exits", async () => {
    speechCommands.length = 0;
    const renderer = await renderStrictMode(
      <TranslateResult sourceText="hello" targetLanguage="zh-CN" preferences={preferences} />,
    );
    const read = renderStats.actionHandlers.find((action) => action.title === "Read Source Text");
    expect(read).toBeDefined();
    expect(read?.shortcut).toEqual({ modifiers: ["cmd", "shift"], key: "p" });
    await act(async () => {
      read?.onAction?.();
    });
    expect(speechCommands).toHaveLength(2);
    await act(async () => {
      speechCommands[0].finish(null, "en");
      speechCommands[1].finish(null, "Samantha en_US # Hello");
    });
    expect(speechCommands).toHaveLength(3);
    renderStats.actionHandlers
      .find((action) => action.title === "View Full Source Text")
      ?.onAction?.();
    const page = navigation.push.mock.calls.at(-1)?.[0];
    renderStats.actionTitles.length = 0;
    let sourcePage: ReactTestRenderer;
    await act(async () => {
      sourcePage = create(page);
    });
    expect(renderStats.actionTitles).toContain("Stop Reading");
    expect(speechCommands[2].signal.aborted).toBe(false);
    await act(async () => {
      sourcePage!.unmount();
    });
    expect(speechCommands[2].signal.aborted).toBe(false);
    await act(async () => {
      renderer.unmount();
    });
    expect(speechCommands[2].signal.aborted).toBe(true);
    speechCommands[2].finish(new Error("aborted"), "");
  });

  it("renders the new Source Text without flashing the previous Session input", async () => {
    const renderer = await renderStrictMode(
      <TranslateCommand {...translateCommandProps("session-1", "previous source")} />,
    );
    renderStats.detailMarkdowns.length = 0;

    await act(async () => {
      renderer.update(
        <StrictMode>
          <TranslateCommand {...translateCommandProps("session-2", "current source")} />
        </StrictMode>,
      );
    });

    expect(
      renderStats.detailMarkdowns.some((markdown) => markdown.startsWith("current source")),
    ).toBe(true);
    expect(
      renderStats.detailMarkdowns.some((markdown) => markdown.includes("previous source")),
    ).toBe(false);
    renderer.unmount();
  });
});
