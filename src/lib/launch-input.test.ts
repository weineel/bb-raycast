import { describe, expect, it } from "vitest";
import { getLaunchInputError, resolveLaunchInput } from "./launch-input";

describe("resolveLaunchInput", () => {
  it("uses an explicit command argument before every implicit source", () => {
    expect(
      resolveLaunchInput({
        argumentText: "typed question",
        fallbackText: "fallback question",
        selectedText: "selected question",
        clipboardText: "clipboard question",
      }),
    ).toEqual({ text: "typed question", source: "argument" });
  });

  it("uses Raycast Fallback Text before selection and clipboard text", () => {
    expect(
      resolveLaunchInput({
        fallbackText: "fallback question",
        selectedText: "selected question",
        clipboardText: "clipboard question",
      }),
    ).toEqual({ text: "fallback question", source: "fallback" });
  });

  it("uses selected text before clipboard text", () => {
    expect(
      resolveLaunchInput({
        selectedText: "selected question",
        clipboardText: "clipboard question",
      }),
    ).toEqual({ text: "selected question", source: "selection" });
  });

  it("ignores blank higher-priority values and uses clipboard text", () => {
    expect(
      resolveLaunchInput({
        argumentText: " ",
        fallbackText: "\n",
        selectedText: "\t",
        clipboardText: "clipboard question",
      }),
    ).toEqual({ text: "clipboard question", source: "clipboard" });
  });
});

describe("getLaunchInputError", () => {
  it("reports when no command, fallback, selection, or clipboard text exists", () => {
    expect(getLaunchInputError(undefined)).toBe("No Input Found");
  });

  it("reports Unicode-aware command input limits", () => {
    expect(
      getLaunchInputError({ text: "😀😀", source: "argument" }, 1, "The initial question"),
    ).toBe("The initial question must be 1 character or fewer.");
  });
});
