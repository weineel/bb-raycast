export function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "Generation stopped.";
    }
    return error.message || "The request failed.";
  }
  return "The request failed.";
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
