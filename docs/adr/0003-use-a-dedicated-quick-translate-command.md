# Use a dedicated Quick Translate command

Raycast can retain a hidden view command until it returns to root search and does not expose a relaunch event to that mounted view, so Benben AI will provide a visible no-view `Quick Translate` command as the global-hotkey entry point for repeated capture. Each invocation resolves fresh text and launches a new Translation Session in `Translate`; accepting a second visible command avoids persisting sensitive session content, polling the frontmost application, or depending on the user's “Pop to Root Search” preference.
