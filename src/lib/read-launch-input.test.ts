import { beforeEach, describe, expect, it, vi } from "vitest";

const raycast = vi.hoisted(() => ({
  getSelectedText: vi.fn(),
  readClipboardText: vi.fn(),
}));

vi.mock("@raycast/api", () => ({
  Clipboard: { readText: raycast.readClipboardText },
  getSelectedText: raycast.getSelectedText,
}));

import { readLaunchInput } from "./read-launch-input";

describe("readLaunchInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    raycast.getSelectedText.mockResolvedValue("selected question");
    raycast.readClipboardText.mockResolvedValue("clipboard question");
  });

  it("reads selected text before accepting Raycast Fallback Text", async () => {
    await expect(readLaunchInput(undefined, "fallback question")).resolves.toEqual({
      text: "selected question",
      source: "selection",
    });
    expect(raycast.getSelectedText).toHaveBeenCalledOnce();
  });

  it("reads clipboard text before accepting Raycast Fallback Text", async () => {
    raycast.getSelectedText.mockRejectedValue(new Error("No selection"));

    await expect(readLaunchInput(undefined, "fallback question")).resolves.toEqual({
      text: "clipboard question",
      source: "clipboard",
    });
    expect(raycast.readClipboardText).toHaveBeenCalledOnce();
  });
});
