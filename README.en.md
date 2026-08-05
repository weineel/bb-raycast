# Benben AI

[中](README.md) | 英

Benben AI is a macOS Raycast extension for private, bring-your-own-key AI chat and
translation.

- **Chat** explains bare terms, answers questions, and supports follow-up messages in the
  current Raycast window.
- **Quick Translate** captures selected or copied text again on every run and starts a fresh
  Translation Session, making it the recommended command for a global hotkey.
- **Translate** streams a professional model translation with a brief explanation, shows
  independent Google and Baidu reference translations, and lets you refine the model result
  with additional context.
- Initial text resolves in this order: command argument, selected text, plain clipboard text,
  then Raycast Fallback Text.
- OpenAI, Anthropic, and OpenAI-compatible endpoints share one model interface. The extension
  never silently switches providers.

## Setup

Open either command's preferences in Raycast.

### Model provider

Choose a global default provider and model. Chat and Translate can optionally override both.

- **OpenAI:** Create an API key at
  [platform.openai.com/api-keys](https://platform.openai.com/api-keys), then add it to
  `OpenAI API Key`.
- **Anthropic:** Create an API key in the
  [Anthropic Console](https://console.anthropic.com/settings/keys), then add it to
  `Anthropic API Key`.
- **OpenAI-Compatible:** Enter the provider's Base URL, API key, and exact Model ID.

The initial model IDs are suggestions and remain fully configurable because model availability
depends on your provider account.

### Google reference translation

Google is optional. Benben AI uses the official Cloud Translation Basic v2 API and does not call
an unofficial free endpoint.

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Cloud Translation API** for that project.
3. Open **APIs & Services → Credentials**, create an API key, and restrict it to the Cloud
   Translation API where possible.
4. Add the key to `Google Cloud Translation API Key`.

If the key is empty, the Google section shows a configuration message while model and Baidu
translation continue normally.

### Baidu reference translation

Baidu is optional and uses the official General Text Translation API.

1. Register an application in the
   [Baidu Translate Open Platform](https://fanyi-api.baidu.com/).
2. Copy the application's **APP ID** and **Secret Key**.
3. Add both values to the matching Benben AI preferences.

If either value is empty, the Baidu section shows a configuration message without affecting the
other services.

## Usage

### Chat

1. Find **Chat** in Raycast and enter an optional `Question` argument.
2. Press Return to open the streaming Chat Thread directly.
3. Use **Follow Up**, **Retry Latest Answer**, **Copy**, **Paste**, or **Stop Generating**.

When the argument is empty, Chat uses selected text, clipboard text, or Raycast Fallback Text.
If none is available, it shows a read-only input error instead of opening a second input form.

The initial question is limited to 20,000 Unicode code points. Follow-ups and total conversation
length are not artificially capped or summarized; the selected provider reports its own context
limit when exceeded.

### Quick Translate

1. Assign a global hotkey to **Quick Translate** in Raycast.
2. Select text in any application, or copy plain text when there is no selection.
3. Press the hotkey to open a fresh Translation Session using `Default Translation Target`.

Quick Translate captures text and sends new translation requests on every run, even when the
Source Text is unchanged. Selected text wins when it differs from clipboard text. With no text
available, the command only shows a HUD and does not open the results. Do not assign the repeated
capture hotkey to **Translate**, because Raycast can restore that command's mounted results view.

### Translate

1. Find **Translate** in Raycast and enter an optional `Source Text` argument.
2. Optionally choose a `Target Language` argument; otherwise the global default is used.
3. Press Return to open the results directly.
4. Move between Model, Google, Baidu, and Source Text in the result list.
5. Use **Refine Model Translation** to provide context or request another wording.

Source Text and target language remain fixed during a translation session. A refinement updates
only the model result; Google and Baidu stay as references to the original text. Start a new
command to change the source or target. Translation Revisions are available from the Model
Translation action panel. Source Text is limited to 5,000 Unicode code points.

## Privacy

- Requests go directly from Raycast to the provider configured for that section.
- API credentials remain in Raycast preferences.
- Benben AI has no backend, analytics, or persistent conversation history.
- Prompts, Source Text, responses, and API keys are not logged by the extension.
- Closing the command clears its in-memory Chat Thread or Translation Session.

Your selected providers may process or retain requests according to their own terms and privacy
policies.

## Development

```bash
pnpm install
pnpm test
pnpm lint
pnpm build
```

The `author` field in `package.json` must be replaced with the publisher's Raycast Store handle
before submission.
