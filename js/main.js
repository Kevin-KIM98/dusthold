// 시작·게임 루프·탭 전환·자동 저장. DOM과 localStorage는 여기(와 render/, input.js)만.

import { CONFIG } from './config.js';
import { t } from './strings.js';
import { createState, serialize, deserialize } from './sim/state.js';
import { advance, tick, setSpeed, togglePaused, setPaused } from './sim/time.js';
import { initUI, renderUI, showTitle, showGame, setView, closePanel, showToast, setDebug, getCanvas, armNewGameConfirm, isNewGameArmed } from './render/ui.js';
import { drawSurface } from './render/surfaceView.js';
import { drawBunker } from './render/bunkerView.js';
import { initInput } from './input.js';

const app = {
  state: null,
  view: 'surface',
  lastTs: 0,
  sinceSaveSec: 0,
  loopStarted: false,
  debug: false,
  fps: 0,
  canvas: null,
  ctx: null,
  cssW: 0,
  cssH: 0,
};

// ---------- 저장 ----------
function readSave() {
  try {
    const raw = localStorage.getItem(CONFIG.SAVE.KEY);
    if (!raw) return { exists: false, state: null };
    const state = deserialize(raw);
    return { exists: true, state };
  } catch {
    return { exists: false, state: null };
  }
}

function saveNow() {
  if (!app.state) return false;
  try {
    localStorage.setItem(CONFIG.SAVE.KEY, serialize(app.state));
    app.sinceSaveSec = 0;
    return true;
  } catch {
    return false;
  }
}

function clearSave() {
  try { localStorage.removeItem(CONFIG.SAVE.KEY); } catch {}
}

// ---------- 시작 ----------
function newSeed() {
  return Date.now() >>> 0;
}

function startGame(state) {
  app.state = state;
  app.sinceSaveSec = 0;
  showGame();
  changeView('surface');
  resizeCanvas();
  renderUI(state);
  if (!app.loopStarted) {
    app.loopStarted = true;
    app.lastTs = performance.now();
    requestAnimationFrame(frame);
  }
}

function onNewGame() {
  const { exists } = readSave();
  if (exists && !isNewGameArmed()) {
    armNewGameConfirm();
    return;
  }
  clearSave();
  startGame(createState(newSeed()));
}

function onContinue() {
  const { state } = readSave();
  if (state) {
    startGame(state);
    showToast(t('toast.loaded'));
  } else {
    showToast(t('toast.saveBroken'));
    clearSave();
    startGame(createState(newSeed()));
  }
}

// ---------- 화면 ----------
function changeView(view) {
  app.view = view;
  setView(view);
  if (view !== 'log') resizeCanvas();
}

function resizeCanvas() {
  const canvas = app.canvas;
  const parent = canvas.parentElement;
  const w = parent.clientWidth;
  const h = parent.clientHeight;
  if (w === 0 || h === 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.UI.DPR_MAX);
  if (app.cssW === w && app.cssH === h && canvas.width === Math.round(w * dpr)) return;
  app.cssW = w;
  app.cssH = h;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  app.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw() {
  if (app.view === 'log' || app.cssW === 0) return;
  const ctx = app.ctx;
  ctx.clearRect(0, 0, app.cssW, app.cssH);
  if (app.view === 'surface') drawSurface(ctx, app.cssW, app.cssH, app.state);
  else drawBunker(ctx, app.cssW, app.cssH, app.state);
}

function drainEvents() {
  const ev = app.state.events;
  if (ev.length === 0) return;
  for (const e of ev) showToast(t(e.key, e.params || undefined));
  ev.length = 0;
}

// ---------- 루프 (렌더는 rAF, 시뮬레이션은 고정 틱) ----------
function frame(ts) {
  const dt = Math.max(0, (ts - app.lastTs) / 1000);
  app.lastTs = ts;

  advance(app.state, dt);
  drainEvents();

  app.sinceSaveSec += dt;
  if (app.sinceSaveSec >= CONFIG.SAVE.AUTOSAVE_INTERVAL_SEC) saveNow();

  if (dt > 0) {
    const inst = 1 / dt;
    app.fps = app.fps === 0 ? inst : app.fps + (inst - app.fps) * CONFIG.UI.FPS_SMOOTHING;
  }
  if (app.debug) setDebug(true, t('debug.fps', { fps: Math.round(app.fps), tick: app.state.time.tick }));

  draw();
  renderUI(app.state);
  requestAnimationFrame(frame);
}

// ---------- 조작 핸들러 ----------
const handlers = {
  onNewGame,
  onContinue,
  onTogglePause() { if (app.state) togglePaused(app.state); },
  onSpeed(n) { if (app.state) setSpeed(app.state, n); },
  onTab(view) { if (app.state) changeView(view); },
  onToggleView() { if (app.state) changeView(app.view === 'surface' ? 'bunker' : 'surface'); },
  onClose() { closePanel(); },
  onDebug() { app.debug = !app.debug; setDebug(app.debug, ''); },
};

// ---------- 부트 ----------
function boot() {
  initUI(handlers);
  initInput(handlers);
  app.canvas = getCanvas();
  app.ctx = app.canvas.getContext('2d');

  window.addEventListener('resize', resizeCanvas);
  // 패널 펼침 등으로 무대 크기가 바뀌면 캔버스도 다시 맞춘다
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => resizeCanvas()).observe(app.canvas.parentElement);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  window.addEventListener('pagehide', saveNow);

  const { exists } = readSave();
  showTitle(exists);

  // 디버그·테스트용 손잡이 (F9, 브라우저 테스트)
  window.DUSTHOLD = {
    get state() { return app.state; },
    get view() { return app.view; },
    saveNow,
    readSave,
    setSpeed: (n) => setSpeed(app.state, n),
    setPaused: (p) => setPaused(app.state, p),
    stepTicks(n) { for (let i = 0; i < n; i++) tick(app.state); renderUI(app.state); },
    setTick(v) { app.state.time.tick = v; renderUI(app.state); },
    render() { draw(); renderUI(app.state); },
  };
}

boot();
