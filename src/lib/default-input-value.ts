export function chooseDefaultInput(
  selectedText: string | undefined,
  clipboardText: string | undefined,
): string {
  if (selectedText?.trim()) {
    return selectedText;
  }
  if (clipboardText?.trim()) {
    return clipboardText;
  }
  return "";
}
