import { describe, expect, it } from "vitest";
import { chooseDefaultInput } from "./default-input-value";

describe("default input", () => {
  it("prefers selected text over clipboard text", () => {
    expect(chooseDefaultInput("selected", "clipboard")).toBe("selected");
  });

  it("uses clipboard text when selection is empty", () => {
    expect(chooseDefaultInput("  ", "clipboard")).toBe("clipboard");
  });

  it("returns an empty editable input when neither source has text", () => {
    expect(chooseDefaultInput(undefined, " ")).toBe("");
  });
});
