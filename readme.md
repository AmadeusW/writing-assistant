# Writing Assistant

Writing Assistant improves the choice of words, structure of sentences, flow of paragraphs.

![v0.1 demo](https://private-user-images.githubusercontent.com/1673956/585511301-ce6761b5-1ebe-4e30-8f25-cafd5cb27c75.gif?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3Nzc0NzU4NTcsIm5iZiI6MTc3NzQ3NTU1NywicGF0aCI6Ii8xNjczOTU2LzU4NTUxMTMwMS1jZTY3NjFiNS0xZWJlLTRlMzAtOGYyNS1jYWZkNWNiMjdjNzUuZ2lmP1gtQW16LUFsZ29yaXRobT1BV1M0LUhNQUMtU0hBMjU2JlgtQW16LUNyZWRlbnRpYWw9QUtJQVZDT0RZTFNBNTNQUUs0WkElMkYyMDI2MDQyOSUyRnVzLWVhc3QtMSUyRnMzJTJGYXdzNF9yZXF1ZXN0JlgtQW16LURhdGU9MjAyNjA0MjlUMTUxMjM3WiZYLUFtei1FeHBpcmVzPTMwMCZYLUFtei1TaWduYXR1cmU9YTc1ZDU1NWExY2NlNDEyYTBmOGM2NDdlNzlhZGQxNWY0YmRhNzU0NzkzM2U4ZjkwZDU0YjBmNzM4OThjZmU3MCZYLUFtei1TaWduZWRIZWFkZXJzPWhvc3QmcmVzcG9uc2UtY29udGVudC10eXBlPWltYWdlJTJGZ2lmIn0.Wn8ZJkjGZO0Jsi24ZFDr-Nu3UbRU4rdj-V8kE0faMsw)

## How to use it

- The interface consists of input tile (leftmost) and any number of output tiles.
- You enter **input content** and **system prompt** in output tiles
- When you type in the input tile, Writing Assistant multiplexes LLM requests, using each tile's system prompt and input content.
- Effectively you get rapid feedback for your input text.

### Scoping
Scope LLM refinement to specific phrase:
When system prompt includes keywords like `paragraph`, `sentence` and `word`, that phrase directly under cursor is surrounded by `[SELECTED]...[/SELECTED]`, and LLM refinement is scoped to just this phrase.

### On line

You can use any OpenAI compatible endpoint, such as OpenRouter

URL: `https://openrouter.ai/api/v1/chat/completions`
Key: `sk-or-v1-...` (your own key)
Model: `google/gemini-3-flash-preview` (recommend a fast and small model)
Parallel: checked

### Locally

You can use any OpenAI compatible endpoint, such as OpenRouter or LM Studio

Launch with `node server.js`, go to `http://localhost:7777`
URL: `http://localhost:1234/api/v1/chat/completions`
Key: not needed
Model: not needed
Parallel: unchecked


