import { beforeEach, describe, expect, it, vi } from "vitest";

const raycast = vi.hoisted(() => ({
  getSelectedText: vi.fn(),
  launchCommand: vi.fn(),
  readClipboardText: vi.fn(),
  showHUD: vi.fn(),
}));

vi.mock("@raycast/api", () => ({
  Clipboard: { readText: raycast.readClipboardText },
  LaunchType: { UserInitiated: "userInitiated" },
  getSelectedText: raycast.getSelectedText,
  launchCommand: raycast.launchCommand,
  showHUD: raycast.showHUD,
}));

import QuickTranslateCommand from "./quick-translate";

describe("Quick Translate command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    raycast.getSelectedText.mockResolvedValue("selected source");
    raycast.readClipboardText.mockResolvedValue("clipboard source");
  });

  it("starts Translate with a new Translation Session for selected text", async () => {
    await QuickTranslateCommand();

    expect(raycast.launchCommand).toHaveBeenCalledWith({
      name: "translate",
      type: "userInitiated",
      arguments: { sourceText: "selected source" },
      context: { translationSessionId: expect.any(String) },
    });
    expect(raycast.readClipboardText).not.toHaveBeenCalled();
  });

  it("uses clipboard text when selected text is unavailable", async () => {
    raycast.getSelectedText.mockRejectedValue(new Error("No selection"));

    await QuickTranslateCommand();

    expect(raycast.launchCommand).toHaveBeenCalledWith(
      expect.objectContaining({ arguments: { sourceText: "clipboard source" } }),
    );
  });

  it("creates a distinct Translation Session for repeated identical Source Text", async () => {
    await QuickTranslateCommand();
    await QuickTranslateCommand();

    const firstContext = raycast.launchCommand.mock.calls[0]?.[0].context;
    const secondContext = raycast.launchCommand.mock.calls[1]?.[0].context;
    expect(firstContext.translationSessionId).not.toBe(secondContext.translationSessionId);
  });

  it("shows a HUD instead of opening Translate when no text is available", async () => {
    raycast.getSelectedText.mockRejectedValue(new Error("No selection"));
    raycast.readClipboardText.mockResolvedValue(undefined);

    await QuickTranslateCommand();

    expect(raycast.showHUD).toHaveBeenCalledWith("No text selected or copied");
    expect(raycast.launchCommand).not.toHaveBeenCalled();
  });

  it("shows the selected-text validation error without falling through to clipboard text", async () => {
    raycast.getSelectedText.mockResolvedValue("x".repeat(5_001));

    await QuickTranslateCommand();

    expect(raycast.showHUD).toHaveBeenCalledWith("Source Text must be 5,000 characters or fewer.");
    expect(raycast.readClipboardText).not.toHaveBeenCalled();
    expect(raycast.launchCommand).not.toHaveBeenCalled();
  });
});
