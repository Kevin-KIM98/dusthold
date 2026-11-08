// 벙커: 굴착·건설·배치·제작. 전력망 계산은 economy.js. DOM 금지 (Node에서 테스트).
//
// 좌표: floor 1(맨 위)~MAX_FLOORS, col 0~COLS-1. 샤프트는 SHAFT_COL 줄에만.
// 칸: dug(파냄) 여부만 저장. 방은 rooms 목록(왼쪽 끝 col + 폭 w). 굴착 공사는 digs 목록.

import { CONFIG } from '../config.js';
import { pushLog, pushEvent } from './log.js';
import { spend, missingCost } from './resources.js';
import { isAvailable, findSurvivor, setRest, workEfficiency } from './survivors.js';
import { recomputeGrid, shaftReachesFloor, workerMap } from './economy.js';

const B = CONFIG.BUNKER;
const ROOMS = B.ROOMS;
const T = CONFIG.TIME;

// ---------- 생성 ----------
export function createBunker() {
  const bk = { cols: B.COLS, floors: B.MAX_FLOORS, cells: [], rooms: [], digs: [], nextId: 1, rev: 0 };
  for (let k = 0; k < bk.cols * bk.floors; k++) bk.cells.push({ dug: false });
  const place = (type, floor, col) => {
    const w = ROOMS[type].w;
    for (let c = col; c < col + w; c++) bk.cells[cellIndex(bk, floor, c)].dug = true;
    bk.rooms.push(newRoom(bk, type, floor, col, true));
  };
  for (let f = 1; f <= B.START_SHAFT_FLOORS; f++) place('shaft', f, B.SHAFT_COL);
  for (const r of B.START_ROOMS) place(r.type, r.floor, r.col);
  return bk;
}

function newRoom(bk, type, floor, col, done) {
  return { id: bk.nextId++, type, floor, col, w: ROOMS[type].w, done, progress: done ? 1 : 0, acc: 0, on: false, connected: false, broken: false, craft: null };
}

export function createDoor() {
  return { level: 1, hp: B.DOOR_LEVELS[0].hp };
}

// ---------- 조회 ----------
export function cellIndex(bk, floor, col) {
  return (floor - 1) * bk.cols + col;
}

export function inBounds(bk, floor, col) {
  return floor >= 1 && floor <= bk.floors && col >= 0 && col < bk.cols;
}

export function isDug(state, floor, col) {
  const bk = state.bunker;
  return inBounds(bk, floor, col) && bk.cells[cellIndex(bk, floor, col)].dug;
}

export function roomAt(state, floor, col) {
  return state.bunker.rooms.find((r) => r.floor === floor && col >= r.col && col < r.col + r.w) || null;
}

export function digAt(state, floor, col) {
  return state.bunker.digs.find((d) => d.floor === floor && d.col === col) || null;
}

export function roomById(state, id) {
  return state.bunker.rooms.find((r) => r.id === id) || null;
}

/** 진행 중인 공사(굴착 또는 미완공 방) */
export function projectById(state, id) {
  const d = state.bunker.digs.find((x) => x.id === id);
  if (d) return { kind: 'dig', ref: d };
  const r = roomById(state, id);
  if (r && !r.done) return { kind: 'room', ref: r };
  return null;
}

export function roomDef(type) {
  return ROOMS[type];
}

export function buildersOf(state, id) {
  return state.survivors.filter((s) => s.job === 'build' && s.jobRef === id);
}

export function workersOf(state, roomId) {
  return state.survivors.filter((s) => s.job === 'room' && s.jobRef === roomId);
}

/** 그 층에서 샤프트로부터 파낸 칸을 따라 걸어갈 수 있는 col 집합 */
export function reachableCols(state, floor) {
  const out = new Set();
  if (!shaftReachesFloor(state, floor)) return out;
  out.add(B.SHAFT_COL);
  for (const dir of [-1, 1]) {
    let c = B.SHAFT_COL + dir;
    while (isDug(state, floor, c)) { out.add(c); c += dir; }
  }
  return out;
}

/** 공사 시간 배율 (작을수록 빠름). 인원 0명이면 Infinity */
export function buildTimeMult(builders) {
  if (builders.length === 0) return Infinity;
  let m = builders.length >= 2 ? B.TWO_BUILDERS_MULT : 1;
  if (builders.some((s) => s.specialty === 'build')) m *= B.BUILD_SPECIALTY_MULT;
  return m;
}

export function projectSec(project) {
  return project.kind === 'dig' ? B.DIG.sec : ROOMS[project.ref.type].sec;
}

/** 남은 초 (인원 없으면 Infinity) */
export function projectRemainingSec(state, id) {
  const p = projectById(state, id);
  if (!p) return 0;
  return (1 - p.ref.progress) * projectSec(p) * buildTimeMult(buildersOf(state, id));
}

/** 'scaffold' 비계 → 'frame' 골조 → 'done' 완성 */
export function getBuildStage(room) {
  if (room.done) return 'done';
  return room.progress < B.STAGE_FRAME_AT ? 'scaffold' : 'frame';
}

// ---------- 판정 ----------
function fail(reason, params) {
  return { ok: false, reason, params: params || null };
}
const OK = Object.freeze({ ok: true });

function costCheck(state, cost) {
  const miss = missingCost(state, cost);
  return miss ? fail('reason.need', { need: miss }) : OK;
}

export function canDig(state, floor, col) {
  const bk = state.bunker;
  if (!inBounds(bk, floor, col)) return fail('reason.notConnected');
  if (isDug(state, floor, col)) return fail('reason.dug');
  if (digAt(state, floor, col)) return fail('reason.digBusy');
  let linked = false;
  if (col === B.SHAFT_COL) {
    linked = floor > 1 && shaftReachesFloor(state, floor - 1);
    if (!linked) return fail('reason.shaftAbove');
  } else {
    const reach = reachableCols(state, floor);
    linked = reach.has(col - 1) || reach.has(col + 1);
    if (!linked) return fail('reason.notConnected');
  }
  return costCheck(state, B.DIG.cost);
}

/** 방을 놓을 왼쪽 끝 col. 탭한 칸을 왼쪽으로 먼저, 안 되면 오른쪽 끝으로. 못 놓으면 null */
export function placementFor(state, type, floor, col) {
  const w = ROOMS[type].w;
  const starts = w === 1 ? [col] : [col, col - (w - 1)];
  for (const start of starts) if (placeOk(state, type, floor, start)) return start;
  return null;
}

function placeOk(state, type, floor, start) {
  const w = ROOMS[type].w;
  const reach = reachableCols(state, floor);
  for (let c = start; c < start + w; c++) {
    if (!inBounds(state.bunker, floor, c) || !isDug(state, floor, c) || roomAt(state, floor, c) || digAt(state, floor, c)) return false;
    if (type === 'shaft' ? c !== B.SHAFT_COL : c === B.SHAFT_COL) return false;
    if (type !== 'shaft' && !reach.has(c)) return false;
  }
  if (type === 'shaft' && !shaftReachesFloor(state, floor - 1)) return false;
  return true;
}

export function canBuild(state, type, floor, col) {
  const def = ROOMS[type];
  if (!def) return fail('reason.notTarget');
  if (!isDug(state, floor, col)) return fail('reason.notDug');
  if (roomAt(state, floor, col) || digAt(state, floor, col)) return fail('reason.full');
  if (type === 'shaft') {
    if (col !== B.SHAFT_COL) return fail('reason.shaftOnlyCol');
    if (!shaftReachesFloor(state, floor - 1)) return fail('reason.shaftAbove');
  } else {
    if (col === B.SHAFT_COL) return fail('reason.shaftCol');
    if (!reachableCols(state, floor).has(col)) return fail('reason.notReachable');
    if (placementFor(state, type, floor, col) === null) return fail('reason.noSpace', { w: def.w });
  }
  return costCheck(state, def.cost);
}

// ---------- 행동 ----------
export function startDig(state, floor, col) {
  const c = canDig(state, floor, col);
  if (!c.ok) return c;
  spend(state, B.DIG.cost);
  const id = state.bunker.nextId++;
  state.bunker.digs.push({ id, floor, col, progress: 0 });
  pushLog(state, 'log.digOrder', { floor });
  return { ok: true, id };
}

export function startBuild(state, type, floor, col) {
  const c = canBuild(state, type, floor, col);
  if (!c.ok) return c;
  const start = type === 'shaft' ? col : placementFor(state, type, floor, col);
  spend(state, ROOMS[type].cost);
  const room = newRoom(state.bunker, type, floor, start, false);
  state.bunker.rooms.push(room);
  pushLog(state, 'log.order', { floor, room: type });
  return { ok: true, id: room.id };
}

export function assignBuilder(state, survivorId, projectId) {
  if (!projectById(state, projectId)) return fail('reason.notTarget');
  if (buildersOf(state, projectId).length >= B.MAX_BUILDERS) return fail('reason.full');
  const s = findSurvivor(state, survivorId);
  if (!s || !isAvailable(s)) return fail('reason.unavailable');
  s.job = 'build';
  s.jobRef = projectId;
  return OK;
}

export function assignWorker(state, survivorId, roomId) {
  const r = roomById(state, roomId);
  if (!r) return fail('reason.notTarget');
  if (!r.done) return fail('reason.notDone');
  const def = ROOMS[r.type];
  if (!def.workers) return fail('reason.noWork');
  if (workersOf(state, roomId).length >= def.workers) return fail('reason.full');
  const s = findSurvivor(state, survivorId);
  if (!s || !isAvailable(s)) return fail('reason.unavailable');
  s.job = 'room';
  s.jobRef = roomId;
  recomputeGrid(state);
  return OK;
}

/** 방 근무·공사에서 빼기 */
export function unassignBunker(state, survivorId) {
  const s = findSurvivor(state, survivorId);
  if (!s || (s.job !== 'room' && s.job !== 'build')) return fail('reason.unavailable');
  setRest(s);
  recomputeGrid(state);
  return OK;
}

/**
 * 길게 눌러 옮기기: 지금 하던 방·공사에서 빼서 targetId(방 또는 공사)로.
 * 실패하면 원래 자리로 되돌린다.
 */
export function moveSurvivor(state, survivorId, targetId) {
  const s = findSurvivor(state, survivorId);
  if (!s) return fail('reason.unavailable');
  if (s.jobRef === targetId) return fail('reason.full');
  const prev = { job: s.job, jobRef: s.jobRef, jobTile: s.jobTile };
  if (s.job === 'room' || s.job === 'build') setRest(s);
  const r = projectById(state, targetId) ? assignBuilder(state, survivorId, targetId) : assignWorker(state, survivorId, targetId);
  if (!r.ok) Object.assign(s, prev);
  recomputeGrid(state);
  return r;
}

// ---------- 제작 (작업장) ----------
export function canCraft(state, roomId, item) {
  const r = roomById(state, roomId);
  if (!r || r.type !== 'workshop') return fail('reason.notTarget');
  if (!r.done) return fail('reason.notDone');
  if (r.craft) return fail('reason.crafting');
  const def = B.CRAFTS[item];
  if (!def) return fail('reason.notTarget');
  return costCheck(state, def.cost);
}

export function startCraft(state, roomId, item) {
  const c = canCraft(state, roomId, item);
  if (!c.ok) return c;
  spend(state, B.CRAFTS[item].cost);
  roomById(state, roomId).craft = { item, progress: 0 };
  return OK;
}

/** 무기 완성: 무기 없는 생존자에게 장착 (전투 특기 먼저). 줄 사람이 없으면 보관 */
function finishCraft(state, room) {
  const item = room.craft.item;
  room.craft = null;
  if (item === 'weapon') {
    const pool = state.survivors.filter((s) => !s.weapon);
    pool.sort((a, b) => (b.specialty === 'combat') - (a.specialty === 'combat') || a.id - b.id);
    if (pool.length > 0) {
      pool[0].weapon = true;
      pushLog(state, 'log.crafted', { item, name: pool[0].name });
    } else {
      state.items[item] = (state.items[item] || 0) + 1;
      pushLog(state, 'log.craftedStored', { item });
    }
  }
}

// ---------- 틱 ----------
function stepProjects(state) {
  const bk = state.bunker;
  let changed = false;
  for (let k = 0; k < bk.digs.length; k++) {
    const d = bk.digs[k];
    const m = buildTimeMult(buildersOf(state, d.id));
    if (m === Infinity) continue;
    d.progress += T.TICK_SEC / (B.DIG.sec * m);
    if (d.progress >= 1 - 1e-9) {
      bk.digs.splice(k--, 1);
      bk.cells[cellIndex(bk, d.floor, d.col)].dug = true;
      for (const s of buildersOf(state, d.id)) setRest(s);
      pushLog(state, 'log.digDone', { floor: d.floor });
      pushEvent(state, 'fx.dug', { floor: d.floor, col: d.col, w: 1 });
      bk.rev++;
      changed = true;
    }
  }
  for (const r of bk.rooms) {
    if (r.done) continue;
    const m = buildTimeMult(buildersOf(state, r.id));
    if (m === Infinity) continue;
    r.progress += T.TICK_SEC / (ROOMS[r.type].sec * m);
    if (r.progress >= 1 - 1e-9) {
      r.progress = 1;
      r.done = true;
      for (const s of buildersOf(state, r.id)) setRest(s);
      pushLog(state, 'log.built', { floor: r.floor, room: r.type });
      pushEvent(state, 'toast.built', { room: r.type });
      pushEvent(state, 'fx.built', { floor: r.floor, col: r.col, w: r.w });
      bk.rev++;
      changed = true;
    }
  }
  if (changed) recomputeGrid(state);
}

function stepCrafts(state) {
  const workers = workerMap(state);
  for (const r of state.bunker.rooms) {
    if (!r.craft || !r.on) continue;
    let e = 0;
    for (const s of workers.get(r.id) || []) e += workEfficiency(s, ROOMS[r.type].specialty);
    if (e <= 0) continue;
    r.craft.progress += (T.TICK_SEC * e) / B.CRAFTS[r.craft.item].sec;
    if (r.craft.progress >= 1 - 1e-9) finishCraft(state, r);
  }
}

export function step(state) {
  stepProjects(state);
  stepCrafts(state);
}

// ---------- 디버그·테스트용: 공사 없이 바로 방을 놓는다 (F9 최악 장면 등) ----------
export function debugPlaceRoom(state, type, floor, col) {
  const bk = state.bunker;
  const w = ROOMS[type].w;
  for (let c = col; c < col + w; c++) bk.cells[cellIndex(bk, floor, c)].dug = true;
  const room = newRoom(bk, type, floor, col, true);
  bk.rooms.push(room);
  bk.rev++;
  recomputeGrid(state);
  return room;
}

export function debugDig(state, floor, col) {
  const bk = state.bunker;
  bk.cells[cellIndex(bk, floor, col)].dug = true;
  bk.rev++;
}
