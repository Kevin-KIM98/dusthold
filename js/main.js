// 시작·게임 루프·탭 전환·자동 저장. DOM과 localStorage는 여기(와 render/, input.js)만.

import { CONFIG } from './config.js';
import { t } from './strings.js';
import { createState, serialize, deserialize } from './sim/state.js';
import { advance, tick, setSpeed, togglePaused, setPaused } from './sim/time.js';
import { startExpedition, assignGatherer, unassign } from './sim/surface.js';
import {
  startDig, startBuild, assignBuilder, assignWorker, unassignBunker, moveSurvivor, startCraft,
  roomAt, digAt, projectById, startTurret, startRepair,
} from './sim/bunker.js';
import { upgradeDoor } from './sim/raid.js';
import { initUI, renderUI, renderPanel, openPanel, showTitle, showGame, setView, closePanel, showToast, setDebug, getCanvas, armNewGameConfirm, isNewGameArmed } from './render/ui.js';
import { createSurfaceView } from './render/surfaceView.js';
import { createBunkerView } from './render/bunkerView.js';
import { formatMessage, surfacePanelModel, bunkerPanelModel, reasonText } from './render/viewModel.js';
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
  bunkerView: null,
  selected: -1,     // 선택한 지상 타일 번호 (-1 = 없음)
  bsel: null,       // 선택한 벙커 칸 { kind: 'cell', floor, col } | { kind: 'door' } | null
  picker: null,     // 지상: { mode, tile, chosen: [] } / 벙커: { mode: 'builder'|'worker', target }
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
  app.bsel = null;
  app.picker = null;
  app.surfaceView = createSurfaceView();
  app.bunkerView = createBunkerView();
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
  const oldW = app.cssW, oldH = app.cssH;
  app.cssW = w;
  app.cssH = h;
  if (app.surfaceView) app.surfaceView.onResize(oldW, oldH, w, h);
  if (app.bunkerView) app.bunkerView.onResize(oldW, oldH, w, h);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  app.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw(now) {
  if (app.view === 'log' || app.cssW === 0) return;
  const ctx = app.ctx;
  ctx.clearRect(0, 0, app.cssW, app.cssH);
  if (app.view === 'surface') app.surfaceView.draw(ctx, app.cssW, app.cssH, app.state, { selected: app.selected, now });
  else app.bunkerView.draw(ctx, app.cssW, app.cssH, app.state, { selected: app.bsel, now, paused: app.state.paused });
}

function drainEvents() {
  const ev = app.state.events;
  if (ev.length === 0) return;
  for (const e of ev) {
    if (e.key.startsWith('fx.')) app.bunkerView.onEvent(e);
    else showToast(formatMessage(e.key, e.params));
  }
  ev.length = 0;
}

function currentPanelModel() {
  if (app.view === 'surface' && app.selected >= 0) return surfacePanelModel(app.state, app.selected, app.picker);
  if (app.view === 'bunker' && app.bsel) return bunkerPanelModel(app.state, app.bsel, app.picker);
  return null;
}

function toastFail(r) {
  if (!r.ok) showToast(reasonText(r));
  return r.ok;
}

// ---------- 선택·패널 ----------
function selectTile(i) {
  app.selected = i;
  app.picker = null;
  if (i >= 0) openPanel();
}

function selectBunker(hit) {
  app.bsel = hit;
  app.picker = null;
  if (hit) openPanel();
}

function onSurfaceAction(action, arg) {
  const st = app.state;
  const i = app.selected;
  if (action === 'explore' || action === 'attack' || action === 'gather') {
    app.picker = { mode: action, tile: i, chosen: [] };
  } else if (action === 'pick' && app.picker) {
    const c = app.picker.chosen;
    const k = c.indexOf(arg);
    if (k >= 0) c.splice(k, 1);
    else if (c.length < CONFIG.SURFACE.EXPEDITION_MAX) c.push(arg);
  } else if (action === 'depart' && app.picker) {
    if (toastFail(startExpedition(st, i, app.picker.chosen, app.picker.mode))) app.picker = null;
  } else if (action === 'assign') {
    if (toastFail(assignGatherer(st, arg, i))) app.picker = null;
  } else if (action === 'unassign') {
    unassign(st, arg);
  }
}

function onBunkerAction(action, arg) {
  const st = app.state;
  const sel = app.bsel;
  if (!sel) return;
  if (action === 'upgradeDoor') { toastFail(upgradeDoor(st)); return; }
  if (action === 'turret') {
    const r = startTurret(st);
    if (toastFail(r)) app.picker = { mode: 'builder', target: r.id };
    return;
  }
  if (action === 'repair') {
    const r = startRepair(st, arg);
    if (toastFail(r)) app.picker = { mode: 'builder', target: r.id };
    return;
  }
  if (action === 'addBuilder') { app.picker = { mode: 'builder', target: arg }; return; }
  if (action === 'assign' && app.picker) {
    const r = app.picker.mode === 'builder' ? assignBuilder(st, arg, app.picker.target) : assignWorker(st, arg, app.picker.target);
    if (toastFail(r)) app.picker = null;
    return;
  }
  if (action === 'unassign') { unassignBunker(st, arg); return; }
  if (sel.kind !== 'cell') return;
  if (action === 'dig') {
    const r = startDig(st, sel.floor, sel.col);
    if (toastFail(r)) app.picker = { mode: 'builder', target: r.id };
  } else if (action === 'build') {
    const r = startBuild(st, arg, sel.floor, sel.col);
    if (toastFail(r)) app.picker = { mode: 'builder', target: r.id };
  } else if (action === 'addWorker') {
    app.picker = { mode: 'worker', target: arg };
  } else if (action === 'craft') {
    const room = roomAt(st, sel.floor, sel.col);
    if (room) toastFail(startCraft(st, room.id, arg));
  }
}

function onPanelAction(action, arg) {
  if (!app.state) return;
  if (action === 'cancel') app.picker = null;
  else if (app.view === 'surface') onSurfaceAction(action, arg);
  else if (app.view === 'bunker') onBunkerAction(action, arg);
  renderPanel(currentPanelModel());
}

// ---------- 벙커: 길게 눌러 사람 옮기기 ----------
/** 화면 점 아래의 방·공사 { id, floor, col, w } */
function dropTargetAt(x, y) {
  const hit = app.bunkerView.hitTest(x, y, app.cssW, app.cssH);
  if (!hit || hit.kind !== 'cell') return null;
  const d = digAt(app.state, hit.floor, hit.col);
  if (d) return { id: d.id, floor: d.floor, col: d.col, w: 1 };
  const r = roomAt(app.state, hit.floor, hit.col);
  if (r) return { id: r.id, floor: r.floor, col: r.col, w: r.w };
  return null;
}

const bunkerDrag = {
  start(x, y) {
    const id = app.bunkerView.figureAt(x, y);
    if (id === null) return false;
    app.bunkerView.drag = { id, x, y, target: null };
    return true;
  },
  move(x, y) {
    const d = app.bunkerView.drag;
    if (!d) return;
    d.x = x; d.y = y;
    d.target = dropTargetAt(x, y);
  },
  end(x, y) {
    const d = app.bunkerView.drag;
    app.bunkerView.drag = null;
    if (!d) return;
    const target = dropTargetAt(x, y);
    if (target) toastFail(moveSurvivor(app.state, d.id, target.id));
  },
  cancel() { app.bunkerView.drag = null; },
};

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

  draw(ts);
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
  onClose() { app.picker = null; app.selected = -1; app.bsel = null; closePanel(); },
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
      if (!app.state) return;
      if (app.view === 'surface') selectTile(app.surfaceView.screenToTile(x, y, app.cssW, app.cssH, app.state));
      else if (app.view === 'bunker') selectBunker(app.bunkerView.hitTest(x, y, app.cssW, app.cssH));
    },
    onPan(dx, dy) {
      if (!app.state) return;
      if (app.view === 'surface') app.surfaceView.pan(dx, dy, app.state);
      else if (app.view === 'bunker') app.bunkerView.pan(dx, dy, app.cssW, app.cssH);
    },
    onZoom(f, x, y) {
      if (!app.state) return;
      if (app.view === 'surface') app.surfaceView.zoomAt(f, x, y, app.cssW, app.cssH, app.state);
      else if (app.view === 'bunker') app.bunkerView.zoomAt(f, x, y, app.cssW, app.cssH);
    },
    onLongPress(x, y) { return !!app.state && app.view === 'bunker' && bunkerDrag.start(x, y); },
    onDragMove(x, y) { bunkerDrag.move(x, y); },
    onDragEnd(x, y) { bunkerDrag.end(x, y); },
    onDragCancel() { bunkerDrag.cancel(); },
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
    stepTicks(n) { for (let i = 0; i < n; i++) tick(app.state); drainEvents(); renderUI(app.state); },
    setTick(v) { app.state.time.tick = v; renderUI(app.state); },
    render() { draw(performance.now()); renderUI(app.state); renderPanel(currentPanelModel()); },
    get selected() { return app.selected; },
    get bsel() { return app.bsel; },
    get camera() { return app.surfaceView && app.surfaceView.camera; },
    get bunkerCamera() { return app.bunkerView && app.bunkerView.camera; },
    get particles() { return app.bunkerView ? app.bunkerView.fx.count() : 0; },
    projectById: (id) => projectById(app.state, id),
    /** 지상 타일 중심의 페이지 좌표 (테스트에서 탭 위치 계산용) */
    tileToPage(i) {
      const p = app.surfaceView.tileToScreen(i, app.cssW, app.cssH, app.state);
      const r = app.canvas.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    /** 벙커 칸 중심의 페이지 좌표 */
    cellToPage(floor, col) {
      const p = app.bunkerView.cellToScreen(floor, col, app.cssW, app.cssH);
      const r = app.canvas.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    /** 방폭문 중심의 페이지 좌표 */
    doorToPage() {
      const p = app.bunkerView.doorToScreen(app.cssW, app.cssH);
      const r = app.canvas.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    /** 벙커에 그려진 사람의 페이지 좌표 */
    figureToPage(id) {
      const f = app.bunkerView.figures.find((q) => q.id === id);
      if (!f) return null;
      const r = app.canvas.getBoundingClientRect();
      return { x: r.left + f.x, y: r.top + f.y };
    },
  };
}

boot();
