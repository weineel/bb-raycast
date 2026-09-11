import { StrictMode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Action, Form } from "@raycast/api";
import { streamText } from "ai";
import { ChatThread } from "./chat";
import type { Preferences } from "./domain/preferences";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("@raycast/api", () => {
  const Component = () => null;
  const Container = ({
    children,
    actions,
  }: {
    children?: React.ReactNode;
    actions?: React.ReactNode;
  }) => (
    <>
      {children}
      {actions}
    </>
  );
  return {
    Action: Object.assign(Component, {
      SubmitForm: () => null,
      CopyToClipboard: () => null,
      Paste: () => null,
    }),
    ActionPanel: Container,
    Form: Object.assign(Container, { Description: () => null, TextField: () => null }),
    Detail: Object.assign(Container, { Metadata: Object.assign(Component, { Label: Component }) }),
    Icon: new Proxy({}, { get: (_, key) => String(key) }),
    Keyboard: { Shortcut: { Common: { Copy: {} } } },
    Toast: { Style: { Failure: "failure" } },
    showToast: vi.fn(),
    getPreferenceValues: vi.fn(),
    openCommandPreferences: vi.fn(),
    useNavigation: () => ({ push: vi.fn() }),
  };
});
vi.mock("ai", () => ({ streamText: vi.fn() }));

const preferences: Preferences = {
  defaultProvider: "openai",
  defaultOpenAIModel: "test-model",
  defaultAnthropicModel: "test-model",
  openaiApiKey: "test-key",
  defaultAnswerLanguage: "zh-CN",
  defaultTargetLanguage: "zh-CN",
  providerOverride: "global",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let response: ReturnType<typeof deferred<string>>;
let finish: ReturnType<typeof deferred<void>>;
let renderer: ReactTestRenderer;
const input = () => renderer.root.findByType(Form.TextField);
const descriptions = () =>
  renderer.root
    .findAllByType(Form.Description)
    .map((node) => node.props.text)
    .join("\n");
const submit = () =>
  renderer.root.findByType(Action.SubmitForm).props.onSubmit({ followUp: input().props.value });
async function mount() {
  await act(async () => {
    renderer = create(
      <StrictMode>
        <ChatThread
          initialQuestion="hello"
          preferences={preferences}
          activeModel={{ provider: "openai", model: "test-model" }}
        />
      </StrictMode>,
    );
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}
async function answer(text = "First answer") {
  await act(async () => {
    response.resolve(text);
    finish.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(streamText).mockReset();
  vi.mocked(streamText).mockImplementation(() => {
    response = deferred<string>();
    finish = deferred<void>();
    const currentResponse = response;
    const currentFinish = finish;
    return {
      textStream: (async function* () {
        yield await currentResponse.promise;
        await currentFinish.promise;
      })(),
    } as unknown as ReturnType<typeof streamText>;
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.useRealTimers();
});

describe("Chat Thread follow-ups", () => {
  it("submits from a persistent single-line input and keeps the complete conversation", async () => {
    await mount();
    await answer();
    expect(descriptions()).toContain("hello");
    expect(descriptions()).toContain("First answer");
    expect(descriptions()).toContain("openai");
    expect(descriptions()).toContain("test-model");
    expect(input().props.placeholder).toContain("⌘↵");
    await act(async () => input().props.onChange("  More detail  "));
    await act(async () => submit());
    expect(input().props.value).toBe("");
    expect(vi.mocked(streamText).mock.lastCall?.[0].messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "More detail" },
    ]);
    await answer("Second answer");
    expect(descriptions()).toContain("First answer");
    expect(descriptions()).toContain("Second answer");
    expect(
      renderer.root
        .findAllByType(Action.CopyToClipboard)
        .find((node) => node.props.title === "Copy Latest Answer")?.props.content,
    ).toBe("Second answer");
    expect(renderer.root.findByType(Action.Paste).props.content).toBe("Second answer");
  });
});

it("ignores blank and duplicate submissions and preserves a draft typed during generation", async () => {
  await mount();
  await answer();
  await act(async () => input().props.onChange(" \t "));
  await act(async () => submit());
  expect(streamText).toHaveBeenCalledTimes(1);
  await act(async () => input().props.onChange("Next question"));
  const send = renderer.root.findByType(Action.SubmitForm).props.onSubmit;
  await act(async () => {
    send();
    send();
  });
  expect(streamText).toHaveBeenCalledTimes(2);
  await act(async () => input().props.onChange("Draft for later"));
  await act(async () => submit());
  expect(input().props.value).toBe("Draft for later");
  expect(streamText).toHaveBeenCalledTimes(2);
  await answer("Next answer");
  expect(input().props.value).toBe("Draft for later");
});

it("retains long streamed answers and earlier turns without shortening display or copy data", async () => {
  await mount();
  const longAnswer = "BEGIN\n" + "长回答 paragraph\n".repeat(5000) + "END";
  await act(async () => response.resolve(longAnswer));
  expect(descriptions()).toContain(longAnswer);
  await act(async () => finish.resolve());
  for (const question of ["Second", "Third", "Fourth"]) {
    await act(async () => input().props.onChange(question));
    await act(async () => submit());
    await answer(`${question} answer`);
  }
  expect(descriptions()).toContain(longAnswer);
  expect(descriptions()).toContain("Second answer");
  expect(descriptions()).toContain("Third answer");
  expect(descriptions()).toContain("Fourth answer");
  const copy = renderer.root
    .findAllByType(Action.CopyToClipboard)
    .find((node) => node.props.title === "Copy Chat Thread");
  expect(copy?.props.content).toContain(longAnswer);
});

it("shows a failed partial response and retries the same question without duplicating turns", async () => {
  await mount();
  await act(async () => response.resolve("Partial answer"));
  await act(async () => finish.reject(new Error("Request failed")));
  expect(descriptions()).toContain("Partial answer");
  expect(descriptions()).toContain("Request failed");
  const retry = renderer.root
    .findAllByType(Action)
    .find((node) => node.props.title === "Retry Latest Answer");
  await act(async () => {
    retry?.props.onAction();
    retry?.props.onAction();
  });
  expect(streamText).toHaveBeenCalledTimes(2);
  expect(vi.mocked(streamText).mock.lastCall?.[0].messages).toEqual([
    { role: "user", content: "hello" },
  ]);
  await answer("Recovered answer");
  expect(descriptions()).toContain("Recovered answer");
  expect(descriptions()).not.toContain("Request failed");
  expect(descriptions()).not.toContain("Partial answer");
});

it("stops generation, preserves partial content, and allows another follow-up", async () => {
  await mount();
  await act(async () => response.resolve("Partial answer"));
  const stop = renderer.root
    .findAllByType(Action)
    .find((node) => node.props.title === "Stop Generating");
  await act(async () => stop?.props.onAction());
  expect(vi.mocked(streamText).mock.lastCall?.[0].abortSignal?.aborted).toBe(true);
  await act(async () => finish.resolve());
  expect(descriptions()).toContain("Generation stopped.");
  expect(descriptions()).toContain("Partial answer");
  await act(async () => input().props.onChange("Continue"));
  await act(async () => submit());
  await answer("Continued answer");
  expect(descriptions()).toContain("Continued answer");
});
