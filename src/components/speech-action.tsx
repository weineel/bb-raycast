import { Action, Icon, Toast, showToast } from "@raycast/api";
import { useSyncExternalStore } from "react";
import { SpeechController, type SpeechAccent } from "../services/speech";

export interface SpeechActionProps {
  speech: SpeechController;
  sourceText: string;
  accent: SpeechAccent;
}

export function SpeechAction({ speech, sourceText, accent }: SpeechActionProps) {
  const isReading = useSyncExternalStore(speech.subscribe, speech.getSnapshot);
  return (
    <Action
      title={isReading ? "Stop Reading" : "Read Source Text"}
      icon={isReading ? Icon.Stop : Icon.SpeakerOn}
      shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
      onAction={async () => {
        if (speech.getSnapshot()) {
          speech.stop();
          return;
        }
        try {
          await speech.speak(sourceText, accent);
        } catch (error) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Cannot Read Source Text",
            message: error instanceof Error ? error.message : "Local speech failed. Please retry.",
          });
        }
      }}
    />
  );
}
