export type LaunchInputSource = "argument" | "fallback" | "selection" | "clipboard";

export interface LaunchInput {
  text: string;
  source: LaunchInputSource;
}

export interface LaunchInputCandidates {
  argumentText?: string;
  fallbackText?: string;
  selectedText?: string;
  clipboardText?: string;
}

export function resolveLaunchInput(candidates: LaunchInputCandidates): LaunchInput | undefined {
  if (candidates.argumentText?.trim()) {
    return { text: candidates.argumentText, source: "argument" };
  }
  if (candidates.fallbackText?.trim()) {
    return { text: candidates.fallbackText, source: "fallback" };
  }
  if (candidates.selectedText?.trim()) {
    return { text: candidates.selectedText, source: "selection" };
  }
  if (candidates.clipboardText?.trim()) {
    return { text: candidates.clipboardText, source: "clipboard" };
  }
  return undefined;
}

export function getLaunchInputError(
  input: LaunchInput | undefined,
  maxLength?: number,
  label?: string,
): string | undefined {
  if (!input) {
    return "No Input Found";
  }
  if (maxLength !== undefined && label && unicodeLength(input.text) > maxLength) {
    return `${label} must be ${maxLength.toLocaleString()} character${maxLength === 1 ? "" : "s"} or fewer.`;
  }
  return undefined;
}
import { unicodeLength } from "./text-length";
