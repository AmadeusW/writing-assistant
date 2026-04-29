# Writing Assistant

Writing Assistant improves the choice of words, structure of sentences, flow of paragraphs.

<img width="992" height="688" alt="v0.1 demo" src="https://github.com/user-attachments/assets/ce6761b5-1ebe-4e30-8f25-cafd5cb27c75" />

## How to use it

- The interface consists of input tile (leftmost) and any number of output tiles.
- You enter **input content** and **system prompt** in output tiles
- When you type in the input tile, Writing Assistant multiplexes LLM requests, using each tile's system prompt and input content.
- Effectively you get rapid feedback for your input text.

### Scoping
Scope LLM refinement to specific phrase:
When system prompt includes keywords like `paragraph`, `sentence` and `word`, that phrase directly under cursor is surrounded by `[SELECTED]...[/SELECTED]`, and LLM refinement is scoped to just this phrase.

### On line

[🔥 Try Writing Assistant now](https://writing-assistant-3ns5.onrender.com/)

You can use any OpenAI compatible endpoint, such as OpenRouter. Bring your own key.

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


