import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechController, selectSpeechVoice } from "./speech";

const commands = vi.hoisted(
  () =>
    [] as Array<{
      file: string;
      args: string[];
      signal: AbortSignal;
      finish: (error: Error | null, stdout: string) => void;
      input: ReturnType<typeof vi.fn>;
    }>,
);
vi.mock("node:child_process", () => ({
  execFile: vi.fn((file, args, options, callback) => {
    const input = vi.fn();
    commands.push({ file, args, signal: options.signal, finish: callback, input });
    return { stdin: { end: input, on: vi.fn() } };
  }),
}));

const voices =
  "Albert en_US # Hello\nSamantha en_US # Hello\nDaniel en_GB # Hello\nTingting zh_CN # 你好";

describe("Source Text speech", () => {
  beforeEach(() => commands.splice(0));
  it("selects the requested English accent and a Chinese voice", () => {
    expect(selectSpeechVoice("en", "en-US", voices)).toBe("Samantha");
    expect(selectSpeechVoice("en", "en-GB", voices)).toBe("Daniel");
    expect(selectSpeechVoice("zh-Hant", "en-US", voices)).toBe("Tingting");
    expect(() => selectSpeechVoice("ja", "en-US", voices)).toThrow("Chinese and English");
    expect(() => selectSpeechVoice("en", "en-GB", "Samantha en_US # Hello")).toThrow("Install");
  });

  it("starts local speech, streams the original text to stdin and returns to idle on completion", async () => {
    const speech = new SpeechController();
    const reading = speech.speak("hello", "en-US");
    expect(speech.getSnapshot()).toBe(true);
    commands[0].finish(null, "en\n");
    commands[1].finish(null, voices);
    await vi.waitFor(() => expect(commands).toHaveLength(3));
    expect(commands[2].file).toBe("/usr/bin/say");
    expect(commands[2].args).toEqual(["-v", "Samantha"]);
    expect(commands[2].input).toHaveBeenCalledWith("hello");
    commands[2].finish(null, "");
    await reading;
    expect(speech.getSnapshot()).toBe(false);
  });

  it("cancels pending startup and does not let an older request clear its replacement", async () => {
    const speech = new SpeechController();
    const first = speech.speak("hello", "en-US");
    const second = speech.speak("world", "en-GB");
    expect(commands[0].signal.aborted).toBe(true);
    commands[0].finish(null, "en");
    commands[1].finish(null, voices);
    await first;
    expect(commands).toHaveLength(4);
    expect(speech.getSnapshot()).toBe(true);
    speech.stop();
    expect(commands[2].signal.aborted).toBe(true);
    commands[2].finish(new Error("aborted"), "");
    commands[3].finish(new Error("aborted"), "");
    await second;
    expect(speech.getSnapshot()).toBe(false);
  });

  it("allows retry after a failed start and stops active audio", async () => {
    const speech = new SpeechController();
    const failed = speech.speak("hello", "en-US");
    const rejection = expect(failed).rejects.toThrow("failed");
    commands[0].finish(new Error("failed"), "");
    await rejection;
    expect(speech.getSnapshot()).toBe(false);
    expect(commands[1].signal.aborted).toBe(true);

    const retry = speech.speak("hello", "en-US");
    commands[2].finish(null, "en");
    commands[3].finish(null, voices);
    await vi.waitFor(() => expect(commands).toHaveLength(5));
    speech.stop();
    expect(commands[4].signal.aborted).toBe(true);
    commands[4].finish(new Error("aborted"), "");
    await retry;
    expect(speech.getSnapshot()).toBe(false);
  });
});
