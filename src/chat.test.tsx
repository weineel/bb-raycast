import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Action, Form } from "@raycast/api";
import { ChatThread } from "./chat";
import { streamModelResponse } from "./services/model";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("@raycast/api", () => {
  const Item = () => null;
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
    Action: Object.assign(Item, {
      SubmitForm: () => null,
      CopyToClipboard: () => null,
      Paste: () => null,
    }),
    ActionPanel: Container,
    Form: Object.assign(Container, { Description: () => null, TextField: () => null }),
    Detail: Object.assign(Container, { Metadata: Object.assign(Container, { Label: Item }) }),
    Icon: {},
    Keyboard: { Shortcut: { Common: { Copy: {} } } },
    getPreferenceValues: vi.fn(),
    openCommandPreferences: vi.fn(),
    showToast: vi.fn(),
    Toast: { Style: { Failure: "failure" } },
    useNavigation: () => ({ push: vi.fn() }),
  };
});
vi.mock("./services/model", () => ({ streamModelResponse: vi.fn() }));
let renderer: ReactTestRenderer;
let finish: (text: string) => void;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.mocked(streamModelResponse)
    .mockReset()
    .mockImplementation(
      ({ signal }) =>
        new Promise((resolve, reject) => {
          finish = resolve;
          signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" })),
          );
        }),
    );
  await act(async () => {
    renderer = create(
      <ChatThread
        initialQuestion="hello"
        activeModel={{ provider: "openai", model: "test-model" }}
        preferences={{
          defaultProvider: "openai",
          defaultOpenAIModel: "test-model",
          defaultAnthropicModel: "test-model",
          providerOverride: "global",
          defaultAnswerLanguage: "en",
          defaultTargetLanguage: "zh-CN",
        }}
      />,
    );
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.useRealTimers();
});
const field = () => renderer.root.findByType(Form.TextField);
const submit = () => renderer.root.findByType(Action.SubmitForm).props.onSubmit({});
const type = async (text: string) => {
  await act(async () => field().props.onChange(text));
};
const descriptions = () =>
  renderer.root.findAllByType(Form.Description).map((item) => item.props.text);

it("ignores whitespace and accepts only one trimmed follow-up for consecutive submits", async () => {
  await act(async () => finish("First answer"));
  await type("   ");
  await act(async () => submit());
  expect(streamModelResponse).toHaveBeenCalledTimes(1);
  await type("  explain more  ");
  await act(async () => {
    submit();
    submit();
  });
  expect(streamModelResponse).toHaveBeenCalledTimes(2);
  expect(vi.mocked(streamModelResponse).mock.lastCall?.[0].messages.at(-1)).toEqual({
    role: "user",
    content: "explain more",
  });
  expect(field().props.value).toBe("");
});

it("keeps a draft and the same input during streaming, without letting submit stop generation", async () => {
  const input = field();
  await type("next question");
  await act(async () => {
    vi.mocked(streamModelResponse).mock.lastCall?.[0].onText("Partial answer");
    submit();
    submit();
  });
  expect(field()).toBe(input);
  expect(field().props.autoFocus).toBe(true);
  expect(field().props.value).toBe("next question");
  expect(streamModelResponse).toHaveBeenCalledTimes(1);
  expect(vi.mocked(streamModelResponse).mock.lastCall?.[0].signal.aborted).toBe(false);
  expect(descriptions()).toContain("Partial answer");
  await act(async () => finish("Partial answer with final tail"));
  expect(descriptions()).toEqual([
    "hello",
    "Partial answer with final tail",
    "openai",
    "test-model",
  ]);
  expect(field().props.value).toBe("next question");
  expect(field()).toBe(input);
  expect(renderer.root.findByType(Action.CopyToClipboard).props.content).toBe(
    "Partial answer with final tail",
  );
  expect(renderer.root.findByType(Action.Paste).props.content).toBe(
    "Partial answer with final tail",
  );
});

it("stops separately, preserves partial text and draft, then retries the same question", async () => {
  await type("draft");
  await act(async () => vi.mocked(streamModelResponse).mock.lastCall?.[0].onText("Partial"));
  await act(async () =>
    renderer.root
      .findAllByType(Action)
      .find((item) => item.props.title === "Stop Generating")!
      .props.onAction(),
  );
  expect(descriptions()).toEqual([
    "hello",
    "Partial",
    "Generation stopped.",
    "openai",
    "test-model",
  ]);
  expect(field().props.value).toBe("draft");
  await act(async () => {
    const retry = renderer.root
      .findAllByType(Action)
      .find((item) => item.props.title === "Retry Latest Answer")!;
    retry.props.onAction();
    retry.props.onAction();
  });
  expect(streamModelResponse).toHaveBeenCalledTimes(2);
  expect(vi.mocked(streamModelResponse).mock.lastCall?.[0].messages).toEqual([
    { role: "user", content: "hello" },
  ]);
  await act(async () => finish("Retried answer"));
  expect(descriptions()).toEqual(["hello", "Retried answer", "openai", "test-model"]);
  expect(field().props.value).toBe("draft");
});

it("aborts the active request when the Chat Thread unmounts", async () => {
  const signal = vi.mocked(streamModelResponse).mock.lastCall![0].signal;
  await act(async () => renderer.unmount());
  expect(signal.aborted).toBe(true);
});
