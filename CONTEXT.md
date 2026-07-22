# AI Language Assistant

A Raycast extension that provides conversational assistance and translation through selectable language services.

## Language

**Model Provider**:
A selectable language-model service that supplies responses for Chat and Model Translation.
_Avoid_: Vendor, backend, AI source

**Model Translation**:
A context-aware translation produced by a Model Provider, accompanied by a Translation Note and refinable through follow-up messages.
_Avoid_: AI result, LLM result

**Translation Note**:
A brief explanation accompanying Model Translation that clarifies word sense, usage, key wording, tone, or genuine ambiguity.
_Avoid_: Analysis, commentary, reasoning

**Reference Translation**:
An independent service translation presented beside Model Translation for comparison and not changed by follow-up messages.
_Avoid_: Machine translation, baseline translation

**Google Translation**:
The Reference Translation supplied by Google Cloud Translation.
_Avoid_: Machine result, baseline result

**Baidu Translation**:
The Reference Translation supplied by Baidu Translate.
_Avoid_: Baidu result, machine result

**Chat Thread**:
An initial question and its follow-up messages forming one continuous conversation within an open Chat command.
_Avoid_: Chat history, session history

**Bare Term**:
A name, abbreviation, or term submitted to Chat without an explicit question or instruction and therefore treated as a request for explanation.
_Avoid_: Keyword, short query, entity

**Translation Session**:
A translation interaction with fixed Source Text and Target Language, its Model Translation and available reference translations, and follow-up messages used to refine the Model Translation.
_Avoid_: Translation history, translation thread

**Translation Revision**:
An updated Model Translation and Translation Note produced from a follow-up message and retained within the current Translation Session.
_Avoid_: Version, retry result

**Source Text**:
The editable text submitted to Translate, optionally prefilled from the current selection or clipboard.
_Avoid_: Query, prompt, input text
