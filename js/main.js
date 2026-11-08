// 시작·게임 루프·탭 전환·자동 저장. DOM과 localStorage는 여기(와 render/, input.js)만.

import { CONFIG } from './config.js';
import { t } from './strings.js';
import { createState, serialize, deserialize } from './sim/state.js';
import { advance, tick, setSpeed, togglePaused, setPaused, getDay, isFinished, isNight } from './sim/time.js';
import { createWorstState, occupiedCells } from './sim/worst.js';
import { startExpedition, assignGatherer, unassign } from './sim/surface.js';
import {
  startDig, startBuild, assignBuilder, assignWorker, unassignBunker, moveSurvivor, startCraft,
  roomAt, digAt, projectById, startTurret, startRepair,
} from './sim/bunker.js';
import { upgradeDoor } from './sim/raid.js';
import {
  initUI, renderUI, renderPanel, openPanel, showTitle, drawTitleArt, showGame, setView, closePanel, showToast, setDebug, getCanvas,
  armNewGameConfirm, isNewGameArmed, showOverlay, hideOverlay, isOverlayOpen, initOverlay, applyIconSprites,
  renderGuide, pulsePanelButtons, renderMissions,
} from './render/ui.js';
import { createSurfaceView } from './render/surfaceView.js';
import { createBunkerView } from './render/bunkerView.js';
import { formatMessage, surfacePanelModel, bunkerPanelModel, reasonText, tutorialModel, tutorialButtons, missionModel } from './render/viewModel.js';
import { isTutorialActive, skipTutorial } from './sim/tutorial.js';
import { initInput, initCanvasInput } from './input.js';
import { loadSprites, spriteStats } from './render/sprites.js';
import { nightLevel, createShake, doorStep, veilOpacity } from './render/ambience.js';

const SHAKE_BG = '#0d1013';

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
  worst: false,     // F9 최악 장면 중 (저장 안 함)
  worstBackup: null,
  hintQueue: [],
  missionsCollapsed: false, // 미션 카드 접힘
  lastAllDone: null,        // 미션 전부 달성 (막 달성하면 카드를 접는다)
  shake: createShake(),     // 화면 흔들림 (연출)
  doorStep: null,           // 방폭문 체력 칸 (줄면 흔들기)
  veil: -1,                 // 밤 가장자리 어둠 진하기 (마지막으로 넣은 값)
  lastMustMet: null,        // 필수 미션 달성 여부 (바뀔 때 알림)
  hintPausedBefore: false,
};

// ---------- 튜토리얼 힌트 (기기별로 한 번씩) ----------
const HINTS = ['start', 'surface', 'bunker', 'raid', 'goal'];

function hintsSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(CONFIG.SAVE.HINTS_KEY) || '[]')); } catch { return new Set(); }
}

function markHint(ids) {
  const seen = hintsSeen();
  for (const id of ids) seen.add(id);
  try { localStorage.setItem(CONFIG.SAVE.HINTS_KEY, JSON.stringify([...seen])); } catch {}
}

function queueHint(id) {
  if (app.worst || !app.state || hintsSeen().has(id) || app.hintQueue.includes(id)) return;
  app.hintQueue.push(id);
  showNextHint();
}

function showNextHint() {
  if (isOverlayOpen() || app.hintQueue.length === 0) return;
  const id = app.hintQueue[0];
  app.hintPausedBefore = app.state.paused;
  setPaused(app.state, true);
  showOverlay({
    variant: 'hint',
    title: t('hint.' + id + '.title'),
    sub: t('hint.' + id + '.body'),
    buttons: [{ id: 'next', label: t('hint.next'), primary: true }, { id: 'off', label: t('hint.off') }],
  }, (btn) => {
    app.hintQueue.shift();
    if (btn === 'off') { markHint(HINTS); app.hintQueue.length = 0; } else markHint([id]);
    hideOverlay();
    setPaused(app.state, app.hintPausedBefore);
    if (id === 'start' && !isTutorialActive(app.state)) queueHint('surface'); // 가이드가 있으면 가이드가 대신 안내
    showNextHint();
  });
}

// ---------- 결과 화면 ----------
function showOutcome(kind) {
  const st = app.state;
  hideOverlay();
  app.hintQueue.length = 0;
  const stats = [
    [t('over.stat.day'), t('over.stat.dayValue', { day: getDay(st) })],
    [t('over.stat.survivors'), String(st.survivors.length)],
    [t('over.stat.killed'), String(st.stats.killed)],
    [t('over.stat.explored'), String(st.stats.explored)],
    [t('over.stat.built'), String(st.stats.built)],
  ];
  const buttons = [{ id: 'new', label: t('over.new'), primary: true }];
  if (kind === 'victory') buttons.push({ id: 'continue', label: t('over.continue') });
  showOverlay({ variant: 'result', title: t('over.' + kind + '.title'), sub: t('over.' + kind + '.sub'), stats, buttons }, (btn) => {
    hideOverlay();
    if (btn === 'new') {
      clearSave();
      startGame(createState(newSeed()), { fresh: true });
    } else if (btn === 'continue') {
      st.afterVictory = true;
      saveNow();
    }
  });
}

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
  if (!app.state || app.worst) return false;
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

function startGame(state, opts = {}) {
  hideOverlay();
  app.hintQueue.length = 0;
  app.state = state;
  app.sinceSaveSec = 0;
  app.selected = -1;
  app.bsel = null;
  app.picker = null;
  app.missionsCollapsed = false;
  app.lastMustMet = null;
  app.lastAllDone = null;
  app.doorStep = null;
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
  if (opts.fresh) queueHint('start');
  if (state.outcome && isFinished(state)) showOutcome(state.outcome);
}

function onNewGame() {
  const { exists } = readSave();
  if (exists && !isNewGameArmed()) {
    armNewGameConfirm();
    return;
  }
  clearSave();
  startGame(createState(newSeed()), { fresh: true });
}

function onContinue() {
  const { state } = readSave();
  if (state) {
    startGame(state);
    showToast(t('toast.loaded'));
  } else {
    showToast(t('toast.saveBroken'));
    clearSave();
    startGame(createState(newSeed()), { fresh: true });
  }
}

// ---------- 화면 ----------
function changeView(view) {
  app.view = view;
  app.picker = null;
  setView(view);
  if (view !== 'log') resizeCanvas();
  if (view === 'bunker' && app.state && !isTutorialActive(app.state)) queueHint('bunker');
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

function draw(now, guide) {
  if (app.view === 'log' || app.cssW === 0) return;
  const tg = guide && guide.target;
  const ctx = app.ctx; // 두 화면 모두 캔버스 전체를 칠하므로 따로 지우지 않는다
  const night = nightLevel(app.state);
  const off = app.shake.offset(now);
  if (off) {
    // 흔들려서 드러나는 가장자리만 칠하고 옮긴다
    const W = app.cssW, H = app.cssH;
    ctx.save();
    ctx.fillStyle = SHAKE_BG;
    if (off.x > 0) ctx.fillRect(0, 0, off.x, H); else if (off.x < 0) ctx.fillRect(W + off.x, 0, -off.x, H);
    if (off.y > 0) ctx.fillRect(0, 0, W, off.y); else if (off.y < 0) ctx.fillRect(0, H + off.y, W, -off.y);
    ctx.translate(off.x, off.y);
  }
  if (app.view === 'surface') {
    app.surfaceView.draw(ctx, app.cssW, app.cssH, app.state, { selected: app.selected, now, night, guideTile: tg && tg.view === 'surface' ? tg.tile : -1 });
  } else {
    app.bunkerView.draw(ctx, app.cssW, app.cssH, app.state, { selected: app.bsel, now, night, paused: app.state.paused, guideCell: tg && tg.view === 'bunker' ? tg.cell : null });
  }
  if (off) ctx.restore();
}

/** 밤 가장자리 어둠 (CSS 층, 바뀔 때만) */
function setVeil(op) {
  if (op === app.veil) return;
  app.veil = op;
  document.getElementById('night-veil').style.opacity = String(op);
}

/** 방폭문이 맞아 체력이 한 칸 줄 때마다 살짝 흔든다 (습격 중, 문이 버티는 동안) */
function watchDoor(now) {
  const raid = app.state.raid;
  const step = doorStep(app.state);
  if (raid.active && !raid.breached && app.doorStep !== null && step < app.doorStep) app.shake.kick('small', now);
  app.doorStep = step;
}

function drainEvents() {
  const ev = app.state.events;
  if (ev.length === 0) return;
  for (const e of ev) {
    if (e.key.startsWith('fx.')) app.bunkerView.onEvent(e);
    else if (e.key.startsWith('outcome.')) showOutcome(e.key.slice('outcome.'.length));
    else {
      showToast(formatMessage(e.key, e.params));
      if (e.key === 'toast.breach') app.shake.kick('big', performance.now());
      if (e.key === 'toast.roomBroken') app.shake.kick('small', performance.now());
      if (e.key === 'toast.raidWarning') {
        queueHint('raid');
        const mm = missionModel(app.state);
        if (mm && !mm.allMust) { showToast(t('toast.missionDanger')); app.missionsCollapsed = false; }
      }
      if (e.key === 'toast.newDay') { queueHint('goal'); app.missionsCollapsed = false; app.lastMustMet = null; app.lastAllDone = null; }
    }
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
  if (app.worst) {
    // 파티클을 항상 최대(150개)로 채워 둔다
    const fx = app.bunkerView.fx;
    const need = CONFIG.FX.MAX_PARTICLES - fx.count();
    if (need > 0) fx.sparkle(0, 0, CONFIG.BUNKER_VIEW.SIDE * 2 + CONFIG.BUNKER.COLS * CONFIG.BUNKER_VIEW.CELL_W, CONFIG.BUNKER_VIEW.SKY_H + CONFIG.BUNKER.MAX_FLOORS * CONFIG.BUNKER_VIEW.CELL_H, need);
    setDebug(true, t('debug.worst', { fps: Math.round(app.fps), z: app.state.raid.zombies.length, p: fx.count(), cells: occupiedCells(app.state) }));
  } else if (app.debug) setDebug(true, t('debug.fps', { fps: Math.round(app.fps), tick: app.state.time.tick }));

  const guide = app.worst ? null : tutorialModel(app.state);
  watchDoor(ts);
  draw(ts, guide);
  setVeil(veilOpacity(nightLevel(app.state), app.view));
  renderUI(app.state);
  renderPanel(currentPanelModel());
  renderGuide(guide, app.view);
  pulsePanelButtons(guide ? tutorialButtons(guide.step) : []);
  const missions = app.worst || guide ? null : missionModel(app.state);
  renderMissions(missions, app.view, app.missionsCollapsed);
  if (missions) {
    // 필수 미션을 막 다 지켰으면 알림 (밤이 되기 전)
    if (app.lastMustMet === false && missions.allMust && !isNight(app.state)) showToast(t('toast.missionSafe'));
    app.lastMustMet = missions.allMust;
    // 오늘 미션을 전부 끝냈으면 카드를 접는다 (요약 한 줄만)
    if (app.lastAllDone === false && missions.allDone) app.missionsCollapsed = true;
    app.lastAllDone = missions.allDone;
  }
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
  onDebug() { toggleWorst(); },
  onToggleMissions() { app.missionsCollapsed = !app.missionsCollapsed; },
  onSkipGuide() { if (app.state && skipTutorial(app.state)) { showToast(t('toast.tutorialSkipped')); saveNow(); } },
};

// ---------- F9 최악 장면 (성능 측정) ----------
function toggleWorst() {
  if (!app.worst) {
    if (!app.state) return enterWorst();
    app.worstBackup = app.state;
    enterWorst();
  } else {
    app.worst = false;
    app.debug = false;
    setDebug(false, '');
    const back = app.worstBackup;
    app.worstBackup = null;
    if (back) startGame(back); else showTitle(readSave().exists);
  }
}

function enterWorst() {
  const st = createWorstState();
  app.worst = true;
  startGame(st);
  setSpeed(st, CONFIG.TIME.SPEEDS[CONFIG.TIME.SPEEDS.length - 1]);
  setDebug(true, '');
}

// ---------- 부트 ----------
function boot() {
  initUI(handlers);
  initOverlay();
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

  // 움직임 줄이기 설정이면 화면 흔들림을 끈다
  if (window.matchMedia) app.shake.setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // 모바일: 길게 누를 때 뜨는 메뉴 막기
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', () => { resizeCanvas(); drawTitleArt(); });
  // 패널 펼침 등으로 무대 크기가 바뀌면 캔버스도 다시 맞춘다
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => resizeCanvas()).observe(app.canvas.parentElement);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  window.addEventListener('pagehide', saveNow);

  // M6 이미지: 불러오면 캐시를 다시 그린다. 실패하면 도형 그대로
  loadSprites().then((ok) => {
    if (!ok) return;
    if (app.surfaceView) app.surfaceView.invalidate();
    if (app.bunkerView) app.bunkerView.invalidate();
    applyIconSprites();
    drawTitleArt();
  });

  const { exists } = readSave();
  showTitle(exists);
  // 폰에서 성능 확인: index.html?worst
  if (new URLSearchParams(location.search).has(CONFIG.WORST.URL_PARAM)) enterWorst();

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
    render() {
      const g = tutorialModel(app.state);
      draw(performance.now(), g); renderUI(app.state); renderPanel(currentPanelModel()); renderGuide(g, app.view);
      renderMissions(g ? null : missionModel(app.state), app.view, app.missionsCollapsed);
    },
    get selected() { return app.selected; },
    get bsel() { return app.bsel; },
    get camera() { return app.surfaceView && app.surfaceView.camera; },
    get bunkerCamera() { return app.bunkerView && app.bunkerView.camera; },
    get particles() { return app.bunkerView ? app.bunkerView.fx.count() : 0; },
    get worst() { return app.worst; },
    spriteStats,
    get fps() { return app.fps; },
    toggleWorst,
    occupiedCells: () => occupiedCells(app.state),
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
