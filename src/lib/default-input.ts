import { Clipboard, getSelectedText } from "@raycast/api";
import { chooseDefaultInput } from "./default-input-value";

export async function readDefaultInput(): Promise<string> {
  let selectedText: string | undefined;
  try {
    selectedText = await getSelectedText();
  } catch {
    // Raycast throws when the frontmost app has no accessible text selection.
  }

  const clipboardText = await Clipboard.readText();
  return chooseDefaultInput(selectedText, clipboardText);
}
