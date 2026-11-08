// 밸런싱용 자동 플레이어. 게임 로직(js/sim)만 써서 헤드리스로 1장을 끝까지 플레이한다.
// 사람만큼 똑똑하진 않은 "평범한 플레이어" 수준을 목표로 한다. 결과로 난이도를 가늠한다.
//   node tools/balance.js        ← 여러 시드 결과 표
import { CONFIG } from '../js/config.js';
import { createState } from '../js/sim/state.js';
import { tick, getDay, isNight, isFinished, DAY_TICKS, getTickInDay, DAYLIGHT_TICKS } from '../js/sim/time.js';
import { isAvailable, combatPower } from '../js/sim/survivors.js';
import {
  canExplore, canAttack, startExpedition, assignGatherer, unassign, requiredPower, partyPower, isGatherable, isDepleted,
} from '../js/sim/surface.js';
import {
  roomAt, isDug, canDig, startDig, canBuild, startBuild, assignBuilder, assignWorker, buildersOf, workersOf,
  projectById, startTurret, canBuildTurret, turrets, startRepair, canRepair, startCraft, canCraft, unassignBunker,
} from '../js/sim/bunker.js';
import { canUpgradeDoor, upgradeDoor } from '../js/sim/raid.js';

const B = CONFIG.BUNKER;
const SC = B.SHAFT_COL;
const DECIDE_TICKS = 10; // 1초마다 판단
const GUARD_LEAD_TICKS = 250; // 밤 25초 전부터 경비 근무
const MAX_SCOUTS = 2;         // 동시에 보내는 탐험대 수
const PUSH_OUT_DAY = 3;       // 이날부터는 바깥쪽 안개부터 (군 기지 찾기)
const SCRAP_RESERVE = 60;     // 고철이 이만큼 안 되면 남는 사람은 폐허 채집

// 짓는 순서 (무선실은 통신부품이 생기면 맨 앞으로)
const ORDER = [
  { type: 'guard', floor: 1, col: 6 },
  { type: 'farm', floor: 2, col: 4 },
  { turret: true },
  { door: 2 },
  { type: 'workshop', floor: 3, col: 4 },
  { type: 'generator', floor: 3, col: 1 },
  { type: 'guard', floor: 2, col: 6 },
  { type: 'quarters', floor: 2, col: 1 },
  { turret: true },
  { door: 3 },
  { type: 'guard', floor: 3, col: 6 },
  { type: 'medbay', floor: 4, col: 4 },
  { type: 'storage', floor: 1, col: 0 },
];
const RADIO = { type: 'radio', floor: 4, col: 1 };

const idle = (s) => s.survivors.filter(isAvailable);
const take = (s, pred) => {
  const pool = idle(s);
  return pool.find(pred) || pool[0] || null;
};

function rooms(s, type) {
  return s.bunker.rooms.filter((r) => r.type === type && r.done && !r.broken);
}

/** 목표 방을 놓기 위해 파야 할 칸 (샤프트에서 바깥쪽으로) */
function cellsToDig(target) {
  const w = B.ROOMS[target.type].w;
  const out = [];
  for (let f = 2; f <= target.floor; f++) out.push({ floor: f, col: SC, shaft: true });
  if (target.col > SC) for (let c = SC + 1; c < target.col + w; c++) out.push({ floor: target.floor, col: c });
  else for (let c = SC - 1; c >= target.col; c--) out.push({ floor: target.floor, col: c });
  return out;
}

function busyProjects(s) {
  return s.bunker.digs.length + s.bunker.rooms.filter((r) => !r.done || r.repairing).length;
}

/** 목표 하나를 한 걸음 진행. 진행했거나 이미 끝났으면 true */
function advanceTarget(s, target) {
  if (target.door) {
    if (s.door.level >= target.door) return 'done';
    if (canUpgradeDoor(s).ok) upgradeDoor(s);
    return s.door.level >= target.door ? 'done' : 'wait';
  }
  if (target.turret) {
    const want = ORDER.filter((t) => t.turret).indexOf(target) + 1;
    if (turrets(s).length >= want) return 'done';
    if (canBuildTurret(s).ok) { startTurret(s); return 'started'; }
    return 'wait';
  }
  const existing = roomAt(s, target.floor, target.col);
  if (existing && existing.type === target.type) return existing.done ? 'done' : 'wait';
  for (const c of cellsToDig(target)) {
    if (c.shaft) {
      const sh = roomAt(s, c.floor, SC);
      if (sh) { if (!sh.done) return 'wait'; continue; }
      if (!isDug(s, c.floor, SC)) {
        if (s.bunker.digs.some((d) => d.floor === c.floor && d.col === SC)) return 'wait';
        if (canDig(s, c.floor, SC).ok) { startDig(s, c.floor, SC); return 'started'; }
        return 'wait';
      }
      if (canBuild(s, 'shaft', c.floor, SC).ok) { startBuild(s, 'shaft', c.floor, SC); return 'started'; }
      return 'wait';
    }
    if (isDug(s, c.floor, c.col)) continue;
    if (s.bunker.digs.some((d) => d.floor === c.floor && d.col === c.col)) return 'wait';
    if (canDig(s, c.floor, c.col).ok) { startDig(s, c.floor, c.col); return 'started'; }
    return 'wait';
  }
  if (canBuild(s, target.type, target.floor, target.col).ok) { startBuild(s, target.type, target.floor, target.col); return 'started'; }
  return 'wait';
}

function staffRoom(s, room, n, prefer) {
  while (workersOf(s, room.id).length < Math.min(n, B.ROOMS[room.type].workers)) {
    const v = take(s, prefer);
    if (!v || !assignWorker(s, v.id, room.id).ok) break;
  }
}

/** 아직 안 끝난 첫 목표에 모자란 자원 */
function nextShortfall(s, order) {
  for (const t of order) {
    let cost = null;
    if (t.door) { if (s.door.level < t.door) cost = B.DOOR_LEVELS[t.door - 1].cost; }
    else if (t.turret) { if (turrets(s).length < ORDER.filter((x) => x.turret).indexOf(t) + 1) cost = B.ROOMS.turret.cost; }
    else { const r = roomAt(s, t.floor, t.col); if (!r || r.type !== t.type) cost = B.ROOMS[t.type].cost; }
    if (!cost) continue;
    const out = {};
    for (const k of Object.keys(cost)) out[k] = Math.max(0, cost[k] - s.resources[k]);
    return out;
  }
  return {};
}

function decide(s) {
  // 채집 인원은 매번 풀어서 다시 배치 (더 급한 일에 먼저 쓰려고)
  for (const v of s.survivors) if (v.job === 'gather') unassign(s, v.id);

  // 군 기지
  const bi = s.surface.tiles.findIndex((t) => t.type === 'base');
  if (bi >= 0 && canAttack(s, bi).ok) {
    // 방 근무자도 데려온다 (공격대가 최우선)
    const ready = s.survivors.filter((v) => (v.job === 'rest' || v.job === 'room') && v.hp > CONFIG.SURVIVOR.INJURED_HP);
    const party = ready.sort((a, b) => combatPower(b) - combatPower(a)).slice(0, 3);
    if (partyPower(s, party.map((v) => v.id)) >= requiredPower(s.surface.tiles[bi])) for (const v of party) if (v.job === 'room') unassignBunker(s, v.id);
    if (partyPower(s, party.map((v) => v.id)) >= requiredPower(s.surface.tiles[bi])) startExpedition(s, bi, party.map((v) => v.id), 'attack');
  }

  // 1) 고장 수리
  for (const r of s.bunker.rooms) if (r.broken && !r.repairing && canRepair(s, r.id).ok) startRepair(s, r.id);

  // 2) 전력: 수요만큼 발전실 근무자 (넘치면 한 명씩 뺀다)
  for (const g of rooms(s, 'generator')) {
    for (const v of workersOf(s, g.id)) {
      const per = B.ROOMS.generator.perWorker * (v.specialty === B.ROOMS.generator.specialty ? 1 + B.WORK_SPECIALTY_BONUS : 1);
      if (s.power.produced - per >= s.power.consumed) unassignBunker(s, v.id);
    }
  }
  for (const g of rooms(s, 'generator')) {
    while (s.power.produced < s.power.consumed && workersOf(s, g.id).length < B.ROOMS.generator.workers) {
      const v = take(s, (x) => x.specialty === 'tech');
      if (!v || !assignWorker(s, v.id, g.id).ok) break;
    }
  }

  // 3) 경비: 밤과 밤 직전에만, 가장 센 사람 (쉬는 사람 중 없으면 다른 방 근무자를 데려온다). 낮엔 풀어서 다른 일
  const day = getDay(s);
  const guardTime = isNight(s) || getTickInDay(s) >= DAYLIGHT_TICKS - GUARD_LEAD_TICKS;
  if (!guardTime) for (const g of rooms(s, 'guard')) for (const v of workersOf(s, g.id)) unassignBunker(s, v.id);
  // 밤에는 식량·물이 하루치 이상 있으면 재배·정수 근무자도 경비로
  if (guardTime) {
    const n0 = s.survivors.length;
    if (s.resources.food >= n0 * CONFIG.SURVIVOR.FOOD_PER_DAY) for (const r of rooms(s, 'farm')) for (const v of workersOf(s, r.id)) unassignBunker(s, v.id);
    if (s.resources.water >= n0 * CONFIG.SURVIVOR.WATER_PER_DAY) for (const r of rooms(s, 'water')) for (const v of workersOf(s, r.id)) unassignBunker(s, v.id);
  }
  for (const g of (guardTime ? rooms(s, 'guard') : [])) {
    const want = B.ROOMS.guard.workers;
    while (workersOf(s, g.id).length < want) {
      const cand = s.survivors.filter((v) => (isAvailable(v) || (v.job === 'room' && s.bunker.rooms.find((r) => r.id === v.jobRef).type !== 'guard')) && v.hp > CONFIG.SURVIVOR.INJURED_HP)
        .sort((a, b) => combatPower(b) - combatPower(a))[0];
      if (!cand) break;
      if (cand.job === 'room') unassignBunker(s, cand.id);
      if (!assignWorker(s, cand.id, g.id).ok) break;
    }
  }

  // 4) 식량·물: 하루 소비를 넘게 만들 만큼만 (모자라면 1명 더)
  const n = s.survivors.length;
  const perWorker = (type) => B.ROOMS[type].produce.perDay;
  const want = (type, res, per) => {
    const daily = n * per;
    let k = Math.ceil(daily / perWorker(type));
    if (s.resources[res] < daily) k++;
    return k;
  };
  const foodOk = guardTime && s.resources.food >= n * CONFIG.SURVIVOR.FOOD_PER_DAY;
  const waterOk = guardTime && s.resources.water >= n * CONFIG.SURVIVOR.WATER_PER_DAY;
  if (!foodOk) for (const r of rooms(s, 'farm')) staffRoom(s, r, want('farm', 'food', CONFIG.SURVIVOR.FOOD_PER_DAY), (x) => x.specialty === 'gather');
  if (!waterOk) for (const r of rooms(s, 'water')) staffRoom(s, r, want('water', 'water', CONFIG.SURVIVOR.WATER_PER_DAY), (x) => x.specialty === 'tech');
  const trim = (type, res, per) => {
    for (const r of rooms(s, type)) for (const v of workersOf(s, r.id).slice(Math.max(1, want(type, res, per)))) unassignBunker(s, v.id);
  };
  trim('farm', 'food', CONFIG.SURVIVOR.FOOD_PER_DAY);
  trim('water', 'water', CONFIG.SURVIVOR.WATER_PER_DAY);

  // 5) 공사 목표
  const order = s.resources.parts > 0 ? [RADIO, ...ORDER] : ORDER;
  for (const target of order) {
    if (busyProjects(s) >= 2) break;
    const r = advanceTarget(s, target);
    if (r !== 'done') break;
  }

  // 6) 공사 인원
  const projects = [...s.bunker.digs.map((d) => d.id), ...s.bunker.rooms.filter((r) => !r.done || r.repairing).map((r) => r.id)];
  for (const id of projects) {
    if (!projectById(s, id)) continue;
    while (buildersOf(s, id).length < 1) {
      const v = take(s, (x) => x.specialty === 'build');
      if (!v || !assignBuilder(s, v.id, id).ok) break;
    }
  }

  // 7) 작업장: 무기 → 탐사 장비 → 도구
  const ws = rooms(s, 'workshop')[0];
  if (ws) {
    if (!ws.craft) {
      const armed = s.survivors.filter((v) => v.weapon).length;
      const item = armed < Math.min(4, s.survivors.length) ? 'weapon' : !s.survivors.some((v) => v.gear) ? 'gear' : !s.survivors.some((v) => v.tool) ? 'tool' : null;
      if (item && canCraft(s, ws.id, item).ok) startCraft(s, ws.id, item);
    }
    if (ws.craft) staffRoom(s, ws, 1, (x) => x.specialty === 'tech');
    else for (const v of workersOf(s, ws.id)) unassignBunker(s, v.id); // 만들 게 없으면 다른 일
  }

  // 8) 지상
  const tiles = s.surface.tiles;
  const night = isNight(s);
  // 가까운 둥지 (넉넉할 때만)
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.type !== 'nest' || !canAttack(s, i).ok) continue;
    const party = idle(s).sort((a, b) => combatPower(b) - combatPower(a)).slice(0, 3);
    const need = requiredPower(t);
    let pick = [];
    for (const v of party) { pick.push(v); if (partyPower(s, pick.map((x) => x.id)) >= need * 1.5) break; }
    if (partyPower(s, pick.map((x) => x.id)) >= need * 1.5) startExpedition(s, i, pick.map((x) => x.id), 'attack');
  }
  // 탐험: 1명씩, 동시에 MAX_SCOUTS팀까지. 밤 경비 전에 돌아올 수 있을 때만 (밤엔 약한 사람만)
  const topFighter = s.survivors.slice().sort((a, b) => combatPower(b) - combatPower(a))[0];
  const targets = [];
  for (let i = 0; i < tiles.length; i++) if (canExplore(s, i).ok) targets.push(i);
  // 처음엔 가까운 곳부터(캠프·자원), PUSH_OUT_DAY부터는 바깥쪽부터(군 기지 찾기)
  const outward = day >= PUSH_OUT_DAY;
  const baseRing = (t) => t.ring >= CONFIG.SURFACE.TILES.base.minRing;
  targets.sort((a, b) => (outward ? (baseRing(tiles[b]) - baseRing(tiles[a])) || tiles[a].ring - tiles[b].ring : tiles[a].ring - tiles[b].ring));
  for (const best of targets) {
    const cap = s.survivors.length >= 7 ? MAX_SCOUTS + 1 : day <= PUSH_OUT_DAY ? MAX_SCOUTS : 1;
    if (s.surface.expeditions.length >= cap) break;
    if (day > PUSH_OUT_DAY && s.resources.scrap < SCRAP_RESERVE && idle(s).length < 3) break; // 고철이 모자라면 채집 먼저
    const back = getTickInDay(s) + tiles[best].ring * CONFIG.SURFACE.EXPEDITION_SEC_PER_RING * 10 < DAYLIGHT_TICKS - GUARD_LEAD_TICKS;
    const pool = idle(s).filter((x) => (x !== topFighter || back) && (back || night)).sort((a, b) => (b.gear - a.gear) || combatPower(a) - combatPower(b));
    if (!pool[0]) break;
    startExpedition(s, best, [pool[0].id], 'explore');
  }
  // 채집: 남는 사람은 낮에, 다음 공사에 모자란 자원부터 (없으면 가장 적은 자원)
  if (!night) {
    const short = nextShortfall(s, order);
    const need = ['scrap', 'wood', 'food', 'water'].sort((a, b) => (short[b] || 0) - (short[a] || 0) || s.resources[a] - s.resources[b]);
    for (const v of idle(s)) {
      for (const res of need) {
        const i = tiles.findIndex((t) => t.revealed && isGatherable(t) && !isDepleted(t) && CONFIG.SURFACE.TILES[t.type].gather.res === res);
        if (i >= 0 && assignGatherer(s, v.id, i).ok) break;
      }
    }
  }
}

/** 한 판. 결과 요약을 돌려준다 */
export function playGame(seed, maxDays = 20, hooks = {}) {
  const s = createState(seed);
  const limit = maxDays * DAY_TICKS;
  let breaches = 0, firstBreachDay = 0;
  while (!isFinished(s) && s.time.tick < limit) {
    if (s.time.tick % DECIDE_TICKS === 0) decide(s);
    if (hooks.onDay && s.time.tick % DAY_TICKS === (hooks.atTick ?? DAYLIGHT_TICKS - 1)) hooks.onDay(s);
    const was = s.raid.breached;
    tick(s);
    if (!was && s.raid.breached) { breaches++; if (!firstBreachDay) firstBreachDay = getDay(s); }
    s.events.length = 0;
  }
  return {
    seed,
    outcome: s.outcome || 'timeout',
    day: getDay(s),
    survivors: s.survivors.length,
    breaches,
    firstBreachDay,
    killed: s.stats.killed,
    parts: s.resources.parts,
    rooms: s.bunker.rooms.filter((r) => r.done).length,
    state: s,
  };
}
