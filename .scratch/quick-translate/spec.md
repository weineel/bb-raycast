# Quick Translate

## Summary

Add a visible `Quick Translate` command for repeated translation from a global hotkey. Each invocation captures fresh text, starts a new Translation Session, and opens the existing Translate results experience without relying on Raycast's “Pop to Root Search” preference or persisting session content across commands.

## Input Resolution

Chat and Translate share this input-source priority:

1. Command argument
2. Selected text
3. Clipboard text
4. Raycast fallback text

Blank or unreadable sources are skipped. If a higher-priority non-blank source fails validation, show that validation error instead of silently translating a lower-priority source.

Quick Translate has no command argument or fallback-text input of its own, so it resolves selected text before clipboard text.

## Quick Translate Behavior

- `Quick Translate` is a visible, searchable no-view command and is the only command recommended for a global translation hotkey.
- Every invocation captures input again and starts a new Translation Session, even when its Source Text is identical to the previous invocation.
- Every Translation Session uses the configured `Default Translation Target`. Use the existing Translate command when a different Target Language is needed for one launch.
- If neither selected text nor clipboard text is available, show a `No text selected or copied` HUD and do not open Translate.
- Do not persist Source Text, translation results, or the current Translation Session to reuse them across commands.

## Session Transition

When Quick Translate starts a new Translation Session:

- Immediately replace the previous Source Text and results with the new Source Text and per-service loading states.
- Cancel unfinished Model Translation, Google Translation, and Baidu Translation requests from the previous Session.
- Ignore any previous-Session response that arrives after cancellation or after the new Session becomes current.
- Keep existing Translate behavior for independent service completion, partial Model Translation streaming, errors, Retry, Copy, Paste, and Translation Revisions.

## Existing Commands

- `Translate` remains the interactive entry point for command arguments, a launch-specific Target Language, selection, clipboard, and fallback text.
- Binding a global hotkey directly to Translate is not the supported repeated-capture workflow because Raycast can restore its mounted results view.
- `Chat` adopts the shared input-source priority but does not gain a Quick Chat command and does not replace an open Chat Thread when Raycast merely regains focus.

## Acceptance Criteria

- Given a command argument, selected text, clipboard text, and fallback text, Chat and Translate use the command argument.
- Without a command argument, selected text wins over clipboard and fallback text.
- Without a command argument or selection, clipboard text wins over fallback text.
- Fallback text is used only when every higher-priority source is blank or unreadable.
- A validation failure in a chosen higher-priority source is shown without falling through to another source.
- Repeated Quick Translate invocations capture newly selected or copied text and automatically open a fresh Translation Session from an existing results-page workflow.
- Repeating Quick Translate with identical Source Text still starts new provider requests.
- A new invocation cannot display or be overwritten by results from the previous Translation Session.
- Quick Translate uses `Default Translation Target` and shows the agreed HUD when no text is available.
- Existing Translate and Chat behaviors outside the specified input-resolution changes remain unchanged.

## Non-goals

- Persisting or restoring Translation Sessions across command lifecycles.
- Polling the frontmost application or reacting to ordinary window-focus changes.
- Requiring users to enable Raycast's “Pop to Root Search” preference.
- Adding automatic Target Language detection or remembering a launch-specific Target Language.
- Adding Quick Chat or changing Chat Thread lifecycle behavior.
