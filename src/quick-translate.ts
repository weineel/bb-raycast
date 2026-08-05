import { LaunchType, launchCommand, showHUD } from "@raycast/api";
import { randomUUID } from "node:crypto";
import { MAX_SOURCE_TEXT_LENGTH } from "./domain/translation-session";
import { getLaunchInputError } from "./lib/launch-input";
import { readLaunchInput } from "./lib/read-launch-input";

export default async function QuickTranslateCommand() {
  const input = await readLaunchInput();
  if (!input) {
    await showHUD("No text selected or copied");
    return;
  }

  const inputError = getLaunchInputError(input, MAX_SOURCE_TEXT_LENGTH, "Source Text");
  if (inputError) {
    await showHUD(inputError);
    return;
  }

  await launchCommand({
    name: "translate",
    type: LaunchType.UserInitiated,
    arguments: { sourceText: input.text },
    context: { translationSessionId: randomUUID() },
  });
}
