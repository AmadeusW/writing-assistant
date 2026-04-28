'use strict';

const API = 'http://127.0.0.1:1234/v1/chat/completions';
const DEFAULT_PROMPT = 'You are a writing assistant. Your task is to rewrite the following text to prioritize simplicity, clarity and brevity. Your reply MUST contain ONLY the rewritten text, nothing else.';
const DEBOUNCE = 400;
const STORE = 'wa';

// --- State ---
let tiles = [];   // [{id, prompt}]
let nextId = 1;
let mainText = '';

// --- Request orchestration ---
let loopVer = 0;
let currentAbort = null;
let processingId = null;
let queue = [];

// --- Debounce timers ---
let mainTimer = null;
const tileTimers = new Map();

// --- DOM ---
const grid = document.getElementById('grid');
const addBtn = document.getElementById('add-tile');

// --- Persistence ---

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE));
    if (d?.tiles?.length) {
      tiles = d.tiles;
      nextId = d.nextId || tiles.length + 1;
      return;
    }
  } catch {}
  tiles = [{ id: nextId++, prompt: DEFAULT_PROMPT }];
  persist();
}

function persist() {
  localStorage.setItem(STORE, JSON.stringify({ tiles, nextId }));
}

// --- Layout ---

function layout() {
  const n = 1 + tiles.length;
  grid.dataset.cols = n <= 3 ? n : n === 4 ? 2 : 3;
  addBtn.disabled = tiles.length >= 8;
}

// --- Query helpers ---

function tileEl(id) {
  return grid.querySelector(`.output-tile[data-id="${id}"]`);
}

function outputEl(id) {
  return grid.querySelector(`.output-tile[data-id="${id}"] .tile-output`);
}

// --- Tile DOM ---

function buildTile(tile) {
  const el = document.createElement('div');
  el.className = 'tile output-tile';
  el.dataset.id = tile.id;
  el.innerHTML = `
    <div class="tile-bar">
      <button class="btn-copy" title="Copy output">⎘</button>
      <button class="btn-del" title="Remove tile">✕</button>
    </div>
    <div class="tile-body">
      <div class="tile-output"></div>
      <textarea class="tile-prompt" placeholder="System prompt…" spellcheck="false"></textarea>
    </div>`;

  el.querySelector('.tile-prompt').value = tile.prompt;

  el.querySelector('.btn-copy').onclick = () =>
    navigator.clipboard.writeText(el.querySelector('.tile-output').textContent).catch(() => {});

  el.querySelector('.btn-del').onclick = () => delTile(tile.id);

  el.querySelector('.tile-prompt').oninput = (e) => {
    tile.prompt = e.target.value;
    persist();
    clearTimeout(tileTimers.get(tile.id));
    tileTimers.set(tile.id, setTimeout(() => {
      tileTimers.delete(tile.id);
      enqueue(tile.id);
    }, DEBOUNCE));
  };

  return el;
}

function addTile() {
  if (tiles.length >= 8) return;
  const tile = { id: nextId++, prompt: '' };
  tiles.push(tile);
  persist();
  const el = buildTile(tile);
  grid.appendChild(el);
  layout();
  el.querySelector('.tile-prompt').focus();
}

function delTile(id) {
  tiles = tiles.filter(t => t.id !== id);
  persist();
  clearTimeout(tileTimers.get(id));
  tileTimers.delete(id);
  queue = queue.filter(q => q !== id);
  const wasProcessing = processingId === id;
  tileEl(id)?.remove();
  layout();
  if (wasProcessing) resetAndRun([...queue]);
}

// --- Request orchestration ---

function resetAndRun(newQueue) {
  if (currentAbort) currentAbort.abort();
  currentAbort = null;
  processingId = null;
  queue = newQueue;
  const v = ++loopVer;
  runLoop(v);
}

function enqueue(id) {
  if (processingId === id) {
    resetAndRun([id, ...queue]);
  } else if (!queue.includes(id)) {
    queue.push(id);
    if (!processingId) {
      const v = ++loopVer;
      runLoop(v);
    }
  }
}

async function runLoop(v) {
  while (queue.length > 0 && v === loopVer) {
    const id = queue.shift();
    const tile = tiles.find(t => t.id === id);
    if (!tile || !tile.prompt.trim() || !mainText.trim()) continue;

    processingId = id;
    currentAbort = new AbortController();
    const out = outputEl(id);
    const el = tileEl(id);
    if (out) out.textContent = '';
    if (el) el.classList.add('streaming');

    try {
      await doStream(tile.prompt, mainText, out, currentAbort.signal);
    } catch (e) {
      if (e.name === 'AbortError') {
        if (el) el.classList.remove('streaming');
        return; // caller already reset state; new loop (if any) takes over
      }
      if (out && v === loopVer) out.textContent = `[Error: ${e.message}]`;
    }

    if (v === loopVer) { processingId = null; currentAbort = null; }
    if (el) el.classList.remove('streaming');
  }
  if (v === loopVer) { processingId = null; currentAbort = null; }
}

async function doStream(sys, user, out, signal) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'local',
      stream: false,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ],
      reasoning_effort: 'high',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'rewrite',
          strict: true,
          schema: {
            type: 'object',
            properties: { rewritten_message: { type: 'string' } },
            required: ['rewritten_message'],
            additionalProperties: false
          }
        }
      }
    }),
    signal
  });

  if (!r.ok) throw new Error(`HTTP ${r.status}`);

  const data = await r.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (raw && out) {
    try {
      out.textContent = JSON.parse(raw).rewritten_message ?? '';
    } catch {
      out.textContent = raw;
    }
  }
}

// --- Init ---

load();

const mainTile = document.createElement('div');
mainTile.className = 'tile main-tile';
mainTile.innerHTML = '<textarea id="main-input" placeholder="Start typing…" autofocus></textarea>';
grid.appendChild(mainTile);

tiles.forEach(t => grid.appendChild(buildTile(t)));
layout();

document.getElementById('main-input').oninput = (e) => {
  mainText = e.target.value;
  clearTimeout(mainTimer);
  if (!mainText.trim()) {
    resetAndRun([]);
    tiles.forEach(t => { const el = outputEl(t.id); if (el) el.textContent = ''; });
    return;
  }
  mainTimer = setTimeout(() => resetAndRun(tiles.map(t => t.id)), DEBOUNCE);
};

addBtn.onclick = addTile;
