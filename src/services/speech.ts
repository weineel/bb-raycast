import { execFile } from "node:child_process";

export type SpeechAccent = "en-US" | "en-GB";

const languageScript = `ObjC.import("NaturalLanguage");
ObjC.import("Foundation");
function run() {
  const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  const text = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
  const recognizer = $.NLLanguageRecognizer.alloc.init;
  recognizer.processString(text);
  // Isolated Latin words lack enough context for reliable language detection.
  // Prefer English only when the recognizer is uncertain; keep confident foreign results.
  const hypotheses = ObjC.deepUnwrap(recognizer.languageHypothesesWithMaximum(1));
  const confidence = Math.max(0, ...Object.values(hypotheses));
  if (/^[a-z]+(?:['’-][a-z]+)*$/i.test(ObjC.unwrap(text).trim()) && confidence < 0.9) return "en";
  return ObjC.unwrap(recognizer.dominantLanguage) || "und";
}`;

function runCommand(
  file: string,
  args: string[],
  signal: AbortSignal,
  input?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { encoding: "utf8", signal }, (error, stdout) => {
      if (error)
        reject(
          new Error("Local speech failed. Check macOS system voices and retry.", { cause: error }),
        );
      else resolve(stdout);
    });
    child.stdin?.on("error", reject);
    child.stdin?.end(input);
  });
}

export async function detectSpeechLanguage(
  sourceText: string,
  signal: AbortSignal,
): Promise<string> {
  return (
    await runCommand(
      "/usr/bin/osascript",
      ["-l", "JavaScript", "-e", languageScript],
      signal,
      sourceText,
    )
  ).trim();
}

export class SpeechController {
  private active?: AbortController;
  private listeners = new Set<() => void>();

  getSnapshot = (): boolean => !!this.active;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  stop = (): void => {
    this.active?.abort();
    this.active = undefined;
    this.notify();
  };

  async speak(sourceText: string, accent: SpeechAccent): Promise<void> {
    this.stop();
    const controller = new AbortController();
    this.active = controller;
    this.notify();
    try {
      const [language, voices] = await Promise.all([
        detectSpeechLanguage(sourceText, controller.signal),
        runCommand("/usr/bin/say", ["-v", "?"], controller.signal),
      ]);
      if (controller.signal.aborted) return;
      const voice = selectSpeechVoice(language.trim(), accent, voices);
      await runCommand("/usr/bin/say", ["-v", voice], controller.signal, sourceText);
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      controller.abort();
      if (this.active === controller) {
        this.active = undefined;
        this.notify();
      }
    }
  }
}

export function selectSpeechVoice(language: string, accent: SpeechAccent, voices: string): string {
  const locale = language.startsWith("zh")
    ? "zh_CN"
    : language === "en"
      ? accent.replace("-", "_")
      : undefined;
  if (!locale) throw new Error("Read Aloud supports Chinese and English only.");
  const available = voices
    .split("\n")
    .map((line) => line.match(/^(.+?)\s+([a-z]{2}_[A-Z]{2})\s+#/))
    .filter((match) => match?.[2] === locale)
    .map((match) => match![1].trim());
  const preferred = { en_US: "Samantha", en_GB: "Daniel", zh_CN: "Tingting" }[locale];
  const voice = available.find((name) => name === preferred) ?? available[0];
  if (!voice)
    throw new Error(
      `Install a ${locale} system voice in macOS System Settings → Accessibility → Read & Speak, then retry.`,
    );
  return voice;
}
