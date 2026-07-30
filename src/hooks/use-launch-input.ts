import { useEffect, useState } from "react";
import { getLaunchInputError, type LaunchInput } from "../lib/launch-input";
import { readLaunchInput } from "../lib/read-launch-input";

interface UseLaunchInputOptions {
  argumentText?: string;
  fallbackText?: string;
  maxLength: number;
  label: string;
}

interface UseLaunchInputResult {
  input?: LaunchInput;
  error?: string;
  isLoading: boolean;
}

export function useLaunchInput({
  argumentText,
  fallbackText,
  maxLength,
  label,
}: UseLaunchInputOptions): UseLaunchInputResult {
  const [input, setInput] = useState<LaunchInput>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);

    void readLaunchInput(argumentText, fallbackText).then((resolvedInput) => {
      if (isCancelled) return;
      setInput(resolvedInput);
      setError(getLaunchInputError(resolvedInput, maxLength, label));
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [argumentText, fallbackText, label, maxLength]);

  return { input, error, isLoading };
}
