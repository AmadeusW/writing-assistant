'use strict';

const DEFAULT_PROMPT1 = 'You are a writing coach. Your task is to rewrite the following text to prioritize simplicity, clarity and brevity. Your reply MUST contain ONLY the rewritten text, nothing else.';
const DEFAULT_PROMPT2 = 'You are a writing coach. Your task is to rewrite just the selected sentence for professionalism, conciseness and focus on impact.';
const DEBOUNCE = 400;
const STORE = 'wa';
const CFG_STORE = 'wa-cfg';
const SAVED_CFGS_STORE = 'wa-saved-cfgs';

// --- Config ---

let cfg = { url: '', apiKey: '', model: '' };
let savedCfgs = []; // [{url, apiKey, model, label}]

function saveCfg() {
  localStorage.setItem(CFG_STORE, JSON.stringify(cfg));
}

function applyCfgToUI() {
  document.getElementById('cfg-url').value   = cfg.url;
  document.getElementById('cfg-key').value   = cfg.apiKey;
  document.getElementById('cfg-model').value = cfg.model;
}

function cfgLabel(url, model) {
  try { return `${model || '(no model)'} at ${new URL(url).host}`; }
  catch { return model || url || '(unnamed)'; }
}

function rebuildSavedSelect() {
  const sel = document.getElementById('cfg-saved');
  sel.options[0].textContent = 'Saved configs…';
  sel.options[0].disabled = true;
  while (sel.options.length > 1) sel.remove(1);
  savedCfgs.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = c.label;
    sel.appendChild(opt);
  });
  sel.value = '';
}

function markCfgDirty() {
  const sel = document.getElementById('cfg-saved');
  sel.options[0].textContent = 'Unsaved config.';
  sel.options[0].disabled = false;
  sel.value = '';
}

function persistSavedCfgs() {
  localStorage.setItem(SAVED_CFGS_STORE, JSON.stringify(savedCfgs));
}

function saveCurrentCfg() {
  const label = cfgLabel(cfg.url, cfg.model);
  const idx = savedCfgs.findIndex(c => c.url === cfg.url && c.model === cfg.model);
  const entry = { url: cfg.url, apiKey: cfg.apiKey, model: cfg.model, label };
  if (idx !== -1) savedCfgs[idx] = entry;
  else savedCfgs.push(entry);
  persistSavedCfgs();
  rebuildSavedSelect();
  const newIdx = savedCfgs.findIndex(c => c.url === cfg.url && c.model === cfg.model);
  document.getElementById('cfg-saved').value = newIdx;
}

function loadCfg() {
  try {
    const sc = JSON.parse(localStorage.getItem(SAVED_CFGS_STORE));
    if (Array.isArray(sc)) savedCfgs = sc;
  } catch {}
  rebuildSavedSelect();

  try {
    const saved = JSON.parse(localStorage.getItem(CFG_STORE));
    if (saved?.apiKey) { cfg = saved; applyCfgToUI(); return; }
  } catch {}
  // First run — seed from env.var
  fetch('env.var').then(r => r.text()).then(text => {
    const kv = key => { const m = text.match(new RegExp('^' + key + '\\s*[=:]\\s*[\'"]?([^\'"\\s]+)', 'im')); return m ? m[1] : ''; };
    cfg = { url: kv('url'), apiKey: kv('apikey'), model: kv('model') };
    saveCfg();
    applyCfgToUI();
  }).catch(() => {});
}

// --- State ---
let tiles = [];   // [{id, prompt}]
let nextId = 1;
let mainText = '';
let caretPos = 0;

// --- Request orchestration ---
let loopVer = 0;
let currentAbort = null;
let processingId = null;
let queue = [];
const lastUserText = new Map(); // tile id → last userText sent

// --- Debounce timers ---
let mainTimer = null;
let cfgTimer = null;
const tileTimers = new Map();

function debouncedCfgRefresh() {
  clearTimeout(cfgTimer);
  cfgTimer = setTimeout(() => {
    if (!mainText.trim()) return;
    lastUserText.clear();
    resetAndRun(tiles.map(t => t.id));
  }, DEBOUNCE);
}

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
  tiles = [{ id: nextId++, prompt: DEFAULT_PROMPT1 }, { id: nextId++, prompt: DEFAULT_PROMPT2 }];
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
      lastUserText.delete(tile.id);
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
  lastUserText.delete(id);
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
  const snapCaret = caretPos;
  while (queue.length > 0 && v === loopVer) {
    const id = queue.shift();
    const tile = tiles.find(t => t.id === id);
    if (!tile || !tile.prompt.trim() || !mainText.trim()) continue;

    const { userText, start: emphStart, end: emphEnd } = computeEmphasis(mainText, snapCaret, detectScope(tile.prompt));
    if (userText === lastUserText.get(id)) continue;
    lastUserText.set(id, userText);

    processingId = id;
    currentAbort = new AbortController();
    const out = outputEl(id);
    const el = tileEl(id);
    if (el) el.classList.add('streaming');

    try {
      await doStream(tile.prompt, userText, out, currentAbort.signal, mainText, emphStart, emphEnd);
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

async function doStream(sys, user, out, signal, original, emphStart, emphEnd) {
  const targetUrl = cfg.url || '';
  const apiKey    = cfg.apiKey || '';
  console.log('[wa] doStream | x-target-url:', JSON.stringify(targetUrl),
    '| x-api-key:', apiKey ? `"${apiKey.slice(0, 8)}…"` : '(empty)');

  const r = await fetch('/proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-target-url': targetUrl,
      'x-api-key':    apiKey,
    },
    body: JSON.stringify({
      model: cfg.model || '',
      stream: false,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    }),
    signal
  });

  console.log('[wa] proxy response status:', r.status);
  const body = await r.text();
  if (!r.ok) {
    console.error('[wa] proxy error body:', body.slice(0, 500));
    throw new Error(`HTTP ${r.status}: ${body.slice(0, 300)}`);
  }

  let data;
  try { data = JSON.parse(body); }
  catch { throw new Error(`Bad JSON: ${body.slice(0, 300)}`); }

  const text = data?.choices?.[0]?.message?.content ?? '';
  if (out) renderOutput(out, text, original, emphStart, emphEnd);
}

function renderOutput(out, response, original, start, end) {
  while (out.firstChild) out.removeChild(out.firstChild);
  if (start === 0 && end === original.length) {
    out.textContent = response;
    return;
  }
  const append = (cls, txt) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = txt;
    out.appendChild(s);
  };
  if (start > 0) append('ctx', original.slice(0, start));
  append('rewrite', response);
  if (end < original.length) append('ctx', original.slice(end));
}

// --- Caret-based emphasis ---

function detectScope(prompt) {
  if (/\bparagraph\b/i.test(prompt)) return 'paragraph';
  if (/\bsentence\b/i.test(prompt)) return 'sentence';
  if (/\bword\b/i.test(prompt)) return 'word';
  return 'text';
}

function getWordBounds(text, pos) {
  let start = pos, end = pos;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  while (end < text.length && !/\s/.test(text[end])) end++;
  return { start, end };
}

function getSentenceBounds(text, pos) {
  let start = 0;
  for (let i = pos - 1; i >= 0; i--) {
    if (text[i] === '\n') { start = i + 1; break; }
    if (/[.!?]/.test(text[i]) && (i + 1 >= text.length || /\s/.test(text[i + 1]))) {
      start = i + 1;
      while (start < text.length && /[ \t]/.test(text[start])) start++;
      break;
    }
  }
  let end = text.length;
  for (let i = pos; i < text.length; i++) {
    if (text[i] === '\n') { end = i; break; }
    if (/[.!?]/.test(text[i])) { end = i + 1; break; }
  }
  return { start, end };
}

function getParagraphBounds(text, pos) {
  const sep = '\n\n';
  let start = 0;
  const prev = text.lastIndexOf(sep, pos > 0 ? pos - 1 : 0);
  if (prev !== -1) start = prev + sep.length;
  let end = text.length;
  const next = text.indexOf(sep, pos);
  if (next !== -1) end = next;
  return { start, end };
}

function computeEmphasis(text, pos, scope) {
  const full = { userText: text, start: 0, end: text.length };
  if (scope === 'text' || !text.trim()) return full;
  let bounds;
  if (scope === 'word') bounds = getWordBounds(text, pos);
  else if (scope === 'sentence') bounds = getSentenceBounds(text, pos);
  else if (scope === 'paragraph') bounds = getParagraphBounds(text, pos);
  if (!bounds) return full;
  let { start, end } = bounds;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (start >= end) return full;
  const userText = text.slice(0, start) + ' [SELECTED] ' + text.slice(start, end) + ' [/SELECTED] ' + text.slice(end);
  return { userText, start, end };
}

// --- Init ---

loadCfg();
load();

const mainTile = document.createElement('div');
mainTile.className = 'tile main-tile';
mainTile.innerHTML = '<textarea id="main-input" placeholder="Start typing…" autofocus></textarea>';
grid.appendChild(mainTile);

tiles.forEach(t => grid.appendChild(buildTile(t)));
layout();

const mainInput = document.getElementById('main-input');

mainInput.oninput = (e) => {
  mainText = e.target.value;
  caretPos = mainInput.selectionStart;
  clearTimeout(mainTimer);
  if (!mainText.trim()) {
    resetAndRun([]);
    tiles.forEach(t => { const el = outputEl(t.id); if (el) el.textContent = ''; });
    return;
  }
  mainTimer = setTimeout(() => resetAndRun(tiles.map(t => t.id)), DEBOUNCE);
};

function scheduleCaretRun() {
  caretPos = mainInput.selectionStart;
  if (!mainText.trim()) return;
  clearTimeout(mainTimer);
  mainTimer = setTimeout(() => resetAndRun(tiles.map(t => t.id)), DEBOUNCE);
}

mainInput.addEventListener('click', scheduleCaretRun);
mainInput.addEventListener('keyup', (e) => {
  if (e.key.startsWith('Arrow') || ['Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
    scheduleCaretRun();
  }
});

addBtn.onclick = addTile;

document.getElementById('cfg-url').oninput   = e => { cfg.url    = e.target.value.trim(); saveCfg(); markCfgDirty(); debouncedCfgRefresh(); };
document.getElementById('cfg-key').oninput   = e => { cfg.apiKey = e.target.value.trim(); saveCfg(); markCfgDirty(); debouncedCfgRefresh(); };
document.getElementById('cfg-model').oninput = e => { cfg.model  = e.target.value.trim(); saveCfg(); markCfgDirty(); debouncedCfgRefresh(); };

document.getElementById('cfg-save').onclick = saveCurrentCfg;

document.getElementById('cfg-saved').onchange = e => {
  const idx = parseInt(e.target.value, 10);
  if (isNaN(idx) || !savedCfgs[idx]) return;
  cfg = { ...savedCfgs[idx] };
  saveCfg();
  applyCfgToUI();
};
