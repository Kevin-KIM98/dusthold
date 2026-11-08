// 시작·게임 루프·탭 전환·자동 저장. DOM과 localStorage는 여기(와 render/, input.js)만.

import { CONFIG } from './config.js';
import { t } from './strings.js';
import { createState, serialize, deserialize } from './sim/state.js';
import { advance, tick, setSpeed, togglePaused, setPaused } from './sim/time.js';
import { startExpedition, assignGatherer, unassign } from './sim/surface.js';
import { initUI, renderUI, renderPanel, openPanel, showTitle, showGame, setView, closePanel, showToast, setDebug, getCanvas, armNewGameConfirm, isNewGameArmed } from './render/ui.js';
import { createSurfaceView } from './render/surfaceView.js';
import { drawBunker } from './render/bunkerView.js';
import { formatMessage, surfacePanelModel } from './render/viewModel.js';
import { initInput, initCanvasInput } from './input.js';

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
  surfaceView: null,
  selected: -1,     // 선택한 지상 타일 번호 (-1 = 없음)
  picker: null,     // { mode, tile, chosen: [] } — 원정대·채집 인원 고르는 중
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
  app.selected = -1;
  app.picker = null;
  app.surfaceView = createSurfaceView();
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
  app.picker = null;
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
  if (app.view === 'surface') app.surfaceView.draw(ctx, app.cssW, app.cssH, app.state, { selected: app.selected });
  else drawBunker(ctx, app.cssW, app.cssH, app.state);
}

function drainEvents() {
  const ev = app.state.events;
  if (ev.length === 0) return;
  for (const e of ev) showToast(formatMessage(e.key, e.params));
  ev.length = 0;
}

function currentPanelModel() {
  if (app.view === 'surface' && app.selected >= 0) return surfacePanelModel(app.state, app.selected, app.picker);
  return null;
}

// ---------- 지상 선택·패널 ----------
function selectTile(i) {
  app.selected = i;
  app.picker = null;
  if (i >= 0) openPanel();
}

function onPanelAction(action, arg) {
  const st = app.state;
  if (!st) return;
  const i = app.selected;
  if (action === 'explore' || action === 'attack' || action === 'gather') {
    app.picker = { mode: action, tile: i, chosen: [] };
  } else if (action === 'pick' && app.picker) {
    const c = app.picker.chosen;
    const k = c.indexOf(arg);
    if (k >= 0) c.splice(k, 1);
    else if (c.length < CONFIG.SURFACE.EXPEDITION_MAX) c.push(arg);
  } else if (action === 'depart' && app.picker) {
    const r = startExpedition(st, i, app.picker.chosen, app.picker.mode);
    if (r.ok) app.picker = null;
    else showToast(t(r.reason, r.params || undefined));
  } else if (action === 'assign') {
    const r = assignGatherer(st, arg, i);
    if (r.ok) app.picker = null;
    else showToast(t(r.reason, r.params || undefined));
  } else if (action === 'unassign') {
    unassign(st, arg);
  } else if (action === 'cancel') {
    app.picker = null;
  }
  renderPanel(currentPanelModel());
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
  renderPanel(currentPanelModel());
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
  onClose() { app.picker = null; app.selected = -1; closePanel(); },
  onPanelAction,
  onDebug() { app.debug = !app.debug; setDebug(app.debug, ''); },
};

// ---------- 부트 ----------
function boot() {
  initUI(handlers);
  initInput(handlers);
  app.canvas = getCanvas();
  app.ctx = app.canvas.getContext('2d');
  initCanvasInput(app.canvas, {
    onTap(x, y) {
      if (!app.state || app.view !== 'surface') return;
      selectTile(app.surfaceView.screenToTile(x, y, app.cssW, app.cssH, app.state));
    },
    onPan(dx, dy) {
      if (app.state && app.view === 'surface') app.surfaceView.pan(dx, dy, app.state);
    },
    onZoom(f, x, y) {
      if (app.state && app.view === 'surface') app.surfaceView.zoomAt(f, x, y, app.cssW, app.cssH, app.state);
    },
    onLongPress() {}, // 벙커 생존자 옮기기 (M3)
  });

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
    render() { draw(); renderUI(app.state); renderPanel(currentPanelModel()); },
    get selected() { return app.selected; },
    get camera() { return app.surfaceView && app.surfaceView.camera; },
    /** 타일 중심의 페이지 좌표 (테스트에서 탭 위치 계산용) */
    tileToPage(i) {
      const p = app.surfaceView.tileToScreen(i, app.cssW, app.cssH, app.state);
      const r = app.canvas.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
  };
}

boot();
