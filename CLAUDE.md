# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser-based writing assistant. The user types into a main text tile; up to 8 additional output tiles each hold a custom system prompt and stream a rewrite of the main text from a local LM Studio server. See `readme.md` for the original brief — this file is the authoritative spec for implementation.

## Stack and constraints

- Plain HTML5, minimal CSS, vanilla JS. No frameworks, no bundler, no package manager, no build step. The site should open by double-clicking `index.html`.
- Keep the file count small: roughly `index.html`, one CSS file, one JS file (split only if a single JS file becomes hard to navigate).

## Tiles

- Maximum 9 tiles total: 1 main input + up to 8 outputs.
- The main tile is a plain textarea.
- Each output tile has two modes, toggled by a small icon button on the tile:
  - **edit**: textarea holding the tile's system prompt.
  - **output**: rendered streaming response (read-only view).
- Each output tile also has a copy-to-clipboard icon button (next to the mode toggle).
- A "+" control adds a new output tile (disabled at 8). Each output tile has a remove control.
- On first load (empty `localStorage`), seed exactly one output tile with the prompt:
  > You are a writing assistant. Your task is to rewrite the following text to prioritize simplicity, clarity and brevity.

## Layout

CSS grid that reflows by tile count. Aim for a roughly square arrangement — e.g. 2 tiles → 1×2, 3 → 1×3, 4 → 2×2, 5–6 → 2×3, 7–9 → 3×3. The main tile is just one of the cells; nothing should hard-code its position beyond "first." Keep the grid definition simple enough that switching layouts later is a CSS-only change.

## API

- Endpoint: Use the most appropriate endpoint for getting a response quickly. We assume that would be `POST http://127.0.0.1:1234/v1/chat/completions`.
- OpenAI-compatible chat completions, streaming (`stream: true`, SSE).
- Per request:
  - `system` message = the tile's per-tile prompt.
  - `user` message = the current main text.
  - `model` is ignored by LM Studio — send a placeholder string.
- Render streamed deltas into the tile's output view as they arrive.

## Request orchestration

- Trigger: main text changes, debounced 400ms after the user stops typing. Editing a tile's system prompt also triggers a refresh for that tile (debounced the same way).
- **Sequential** across all tiles: at most one in-flight request at any time. When a refresh is needed, queue the affected tiles in display order and process one at a time.
- **In-flight behavior when input changes mid-run**: *cancel*: abort the current request, drop the pending queue, restart from the first tile.

## Things explicitly out of scope

- Authentication, multi-user, server-side anything.
- Markdown rendering of outputs (plain text is fine unless the user asks).
- Keyboard shortcuts beyond what the browser gives for free.
