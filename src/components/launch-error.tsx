import { Action, ActionPanel, Detail, Icon, openCommandPreferences } from "@raycast/api";

export function LaunchError({
  title,
  message,
  showPreferences = false,
}: {
  title: string;
  message: string;
  showPreferences?: boolean;
}) {
  return (
    <Detail
      navigationTitle={title}
      markdown={`# ${title}\n\n${message}`}
      actions={
        showPreferences ? (
          <ActionPanel>
            <Action
              title="Open Command Preferences"
              icon={Icon.Gear}
              onAction={openCommandPreferences}
            />
          </ActionPanel>
        ) : undefined
      }
    />
  );
}
