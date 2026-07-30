import { Clipboard, getSelectedText } from "@raycast/api";
import { resolveLaunchInput, type LaunchInput } from "./launch-input";

export async function readLaunchInput(
  argumentText?: string,
  fallbackText?: string,
): Promise<LaunchInput | undefined> {
  const explicitInput = resolveLaunchInput({ argumentText, fallbackText });
  if (explicitInput) {
    return explicitInput;
  }

  let selectedText: string | undefined;
  try {
    selectedText = await getSelectedText();
  } catch {
    // Raycast throws when the previously frontmost app has no accessible text selection.
  }

  const selectedInput = resolveLaunchInput({ selectedText });
  if (selectedInput) {
    return selectedInput;
  }

  let clipboardText: string | undefined;
  try {
    clipboardText = await Clipboard.readText();
  } catch {
    // Clipboard access can fail when macOS permissions or the current payload do not allow it.
  }
  return resolveLaunchInput({ clipboardText });
}
