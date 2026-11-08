// 습격: 좀비 등장·이동·방폭문 공격·경비/포탑 방어·침입·새벽 정리. DOM 금지 (Node에서 테스트).
//
// 좀비 위치는 지상 맵 칸 좌표(0~11, 입구 중심 = 5.5, 5.5)로 둔다. 화면이 지상이든 벙커든 같은 데이터를 그린다.
// phase: 'approach'(가장자리 → 입구) → 'door'(방폭문 공격) → 'inside'(문이 부서지면 1층 방 공격)

import { CONFIG } from '../config.js';
import { pushLog, pushEvent } from './log.js';
import { withRng, createRng } from './rng.js';
import { isNight, getDay, getTickInDay, DAY_TICKS, DAYLIGHT_TICKS } from './clock.js';
import { combatPower, isInjured, setRest } from './survivors.js';
import { recomputeGrid, workerMap } from './economy.js';
import { spend, missingCost } from './resources.js';

const R = CONFIG.RAID;
const RR = CONFIG.RAID_RULES;
const Z = CONFIG.ZOMBIES;
const B = CONFIG.BUNKER;
const NEST = CONFIG.SURFACE.TILES.nest;
const T = CONFIG.TIME;
const EPS = 1e-9;

export function createRaid() {
  return { active: false, day: 0, size: 0, side: 0, zombies: [], breached: false, doorHitLogged: false, killed: 0, nextId: 1, nextOrder: 1 };
}

// ---------- 마릿수 ----------
/** 링 3 이내 미제거 둥지 수 (안개에 가려진 것도 포함 — 좀비는 보이든 말든 있다) */
export function activeNestCount(state) {
  return state.surface.tiles.filter((t) => t.type === 'nest' && !t.cleared && t.ring <= NEST.raidBonusMaxRing).length;
}

/** plan.md ③: min(4 + 2×(일차−1) + 2×(둥지 수), 40), 5의 배수 날 ×1.5. 1일차 밤은 연습 습격 (v0.3) */
export function getRaidSize(state, day) {
  if (isPracticeDay(day)) return CONFIG.TUTORIAL.PRACTICE_RAID;
  const base = R.BASE + R.PER_DAY * (day - 1) + NEST.raidBonus * activeNestCount(state);
  const mult = day % R.BIG_EVERY_DAYS === 0 ? R.BIG_MULT : 1;
  return Math.min(Math.round(base * mult), R.MAX);
}

/** 연습 습격 날인가 (방폭문이 부서지지 않는다) */
export function isPracticeDay(day) {
  return day <= CONFIG.TUTORIAL.PRACTICE_DAYS;
}

// ---------- 좀비 ----------
export function zombieHp(type, day) {
  const normal = Z.normal.hpBase + Z.normal.hpPerDay * day;
  return Math.round(normal * Z[type].hpMult);
}

/** 그날 나올 수 있는 종류 중 확률로 고른다 (거구 10% → 돌격형 20% → 나머지 일반) */
function rollType(rng, day) {
  const r = rng.next();
  let acc = 0;
  for (const type of ['brute', 'runner']) {
    if (day < Z[type].fromDay) continue;
    acc += Z[type].chance;
    if (r < acc) return type;
  }
  return 'normal';
}

/** 맵 가장자리의 한 점 (side 0=북 1=동 2=남 3=서, u = 0~1) */
export function edgePoint(side, u) {
  const n = CONFIG.SURFACE.SIZE;
  const m = 0.6; // 맵 바깥으로 살짝
  const along = 0.5 + u * (n - 1);
  if (side === 0) return { x: along, y: -m };
  if (side === 1) return { x: n + m, y: along };
  if (side === 2) return { x: along, y: n + m };
  return { x: -m, y: along };
}

export function entrancePoint() {
  const c = CONFIG.SURFACE.SIZE / 2;
  return { x: c, y: c };
}

/** 지상 맵 위 좀비 위치 */
export function zombiePos(z) {
  const e = entrancePoint();
  if (z.phase !== 'approach') return e;
  const k = Math.min(1, z.t / z.arrive);
  return { x: z.sx + (e.x - z.sx) * k, y: z.sy + (e.y - z.sy) * k };
}

export function doorMax(state) {
  return B.DOOR_LEVELS[state.door.level - 1].hp;
}

// ---------- 오늘 밤 계획 (plan v0.4: 새벽에 미리 정해 두어 낮에 미션으로 보여준다) ----------
function rollPlan(rng, day) {
  const side = rng.int(0, 3);
  const types = [];
  const us = [];
  for (let k = 0; k < R.MAX; k++) { types.push(rollType(rng, day)); us.push(rng.next()); }
  return { day, side, types, us };
}

/** 오늘 밤 좀비 명단을 정한다 (상태의 RNG를 쓴다). 새벽·새 게임·불러오기 때 */
export function planNight(state, day) {
  state.nightPlan = withRng(state, (rng) => rollPlan(rng, day));
  return state.nightPlan;
}

/** 계획을 읽는다. 날이 안 맞으면(디버그로 시간을 건너뛴 경우 등) 상태를 바꾸지 않고 임시로 만든다 */
function readPlan(state, day) {
  const p = state.nightPlan;
  if (p && p.day === day) return p;
  return rollPlan(createRng(state.rng), day);
}

/** 오늘 밤 올 좀비 (종류·체력·도착 시간) */
export function previewZombies(state, day) {
  const plan = readPlan(state, day);
  const n = getRaidSize(state, day);
  return plan.types.slice(0, n).map((type, k) => ({
    type, hp: zombieHp(type, day), arrive: RR.APPROACH_SEC / Z[type].speedMult + k * RR.STAGGER_SEC,
  }));
}

/**
 * 한 밤을 미리 돌려 본다. step()의 이동 → 방어(먼저 온 좀비부터) → 문 공격 순서와 계산을 그대로 따른다.
 * zs = previewZombies 결과, dps = 경비·포탑 화력(밤새 그대로라고 본다)
 */
export function simulateNight(zs, doorHp, dps, practice) {
  let list = zs.map((o) => ({ type: o.type, hp: o.hp, arrive: o.arrive, t: 0, phase: 'approach', order: 0 }));
  let order = 1;
  let hp = doorHp;
  for (let i = 0; i < DAY_TICKS - DAYLIGHT_TICKS; i++) {
    for (const q of list) {
      if (q.phase !== 'approach') continue;
      q.t += T.TICK_SEC;
      if (q.t >= q.arrive - EPS) { q.phase = 'door'; q.order = order++; }
    }
    const front = list.filter((q) => q.phase !== 'approach').sort((a, b) => a.order - b.order);
    let dmg = dps * T.TICK_SEC;
    for (const q of front) {
      if (dmg <= 0) break;
      const d = Math.min(dmg, q.hp);
      q.hp -= d;
      dmg -= d;
    }
    list = list.filter((q) => q.hp > EPS);
    let ddps = 0;
    for (const q of list) if (q.phase === 'door') ddps += Z[q.type].doorDps;
    if (ddps > 0) {
      hp -= ddps * T.TICK_SEC;
      if (practice) hp = Math.max(CONFIG.TUTORIAL.PRACTICE_DOOR_MIN_HP, hp);
      if (hp <= 0) return { breached: true, doorHp: 0 };
    }
    if (list.length === 0) break;
  }
  return { breached: false, doorHp: hp };
}

/** 문이 버티는 최소 화력 (정수). 문 혼자 버티면 0, 상한으로도 안 되면 Infinity */
export function minDefense(zs, doorHp, practice) {
  if (!simulateNight(zs, doorHp, 0, practice).breached) return 0;
  const MAX = CONFIG.MISSIONS.MAX_DPS;
  if (simulateNight(zs, doorHp, MAX, practice).breached) return Infinity;
  let lo = 0, hi = MAX; // lo: 부서짐, hi: 버팀
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (simulateNight(zs, doorHp, mid, practice).breached) lo = mid; else hi = mid;
  }
  return hi;
}

const forecastCache = new Map();

/**
 * 오늘 밤 예보: { day, n, required, doorHp }.
 * 낮이면 밤이 올 때까지의 문 회복을 넣어 계산(체력은 안전하게 내림), 밤이면 밤이 시작될 때 계산해 둔 값.
 */
export function nightForecast(state) {
  const day = getDay(state);
  const raid = state.raid;
  if (raid && raid.day === day && (raid.active || isNight(state))) {
    return { day, n: raid.size, required: raid.requiredDps || 0, doorHp: state.door.hp, night: true, repelled: !raid.active && !raid.breached };
  }
  const max = doorMax(state);
  const regenTicks = Math.max(0, DAYLIGHT_TICKS - 1 - getTickInDay(state));
  const projected = Math.min(max, state.door.hp + max * RR.DOOR_REGEN_PER_SEC * T.TICK_SEC * regenTicks);
  const B = CONFIG.MISSIONS.DOOR_HP_BUCKET;
  const hp = Math.max(1, Math.floor(projected / B) * B);
  const zs = previewZombies(state, day);
  const planned = state.nightPlan && state.nightPlan.day === day;
  const key = [state.seed, day, planned ? 'p' : 't' + state.rng, zs.length, hp, zs.map((z) => z.type[0]).join('')].join('|');
  let required = forecastCache.get(key);
  if (required === undefined) {
    required = minDefense(zs, hp, isPracticeDay(day));
    if (forecastCache.size > 200) forecastCache.clear();
    forecastCache.set(key, required);
  }
  return { day, n: zs.length, required, doorHp: projected, night: false };
}

// ---------- 시작 ----------
/** 밤 시작 시 time.js가 부른다 */
export function onNightStart(state, day) {
  const n = getRaidSize(state, day);
  if (!state.nightPlan || state.nightPlan.day !== day) planNight(state, day);
  const plan = state.nightPlan;
  const zs = previewZombies(state, day);
  const raid = createRaid();
  raid.active = true;
  raid.day = day;
  raid.size = n;
  raid.side = plan.side;
  raid.requiredDps = minDefense(zs, state.door.hp, isPracticeDay(day)); // 이 밤의 필수 미션 기준 (정확한 문 체력)
  zs.forEach((z, k) => {
    const p = edgePoint(raid.side, plan.us[k]);
    raid.zombies.push({
      id: raid.nextId++, type: z.type, hp: z.hp, maxHp: z.hp, sx: p.x, sy: p.y,
      t: 0, arrive: z.arrive, phase: 'approach', order: 0,
    });
  });
  state.raid = raid;
  pushLog(state, 'log.raidStart', { n });
  pushEvent(state, 'toast.raidStart', { n });
}

// ---------- 방어 ----------
/** 경비(경비실 근무자 전투력 합) + 포탑(켜진 것 × 8) — 초당 피해 */
export function defenseDps(state) {
  const workers = workerMap(state);
  let dps = 0;
  for (const r of state.bunker.rooms) {
    if (!r.on) continue;
    if (r.type === 'guard') for (const s of workers.get(r.id) || []) if (!isInjured(s)) dps += combatPower(s);
    if (r.type === 'turret') dps += B.ROOMS.turret.dps;
  }
  return dps;
}

/** 침입 좀비가 다음에 공격할 1층 방: 샤프트에서 가까운 순, 고장 난 방·샤프트 제외 */
export function intrusionTarget(state) {
  const list = state.bunker.rooms.filter((r) => r.floor === 1 && r.done && !r.broken && r.type !== 'shaft' && !B.ROOMS[r.type].attach);
  const dist = (r) => Math.abs(r.col + (r.w - 1) / 2 - B.SHAFT_COL);
  list.sort((a, b) => dist(a) - dist(b) || a.id - b.id);
  return list[0] || null;
}

/** 지금 침입 좀비가 부수고 있는 방인가 (그 방에는 사람을 보낼 수 없다) */
export function isUnderAttack(state, roomId) {
  const raid = state.raid;
  if (!raid || !raid.active || !raid.zombies.some((z) => z.phase === 'inside')) return false;
  const t = intrusionTarget(state);
  return !!t && t.id === roomId;
}

// ---------- 틱 ----------
export function step(state) {
  const door = state.door;
  // 낮 동안 방폭문 자연 회복 (고철 소모 없음)
  if (!isNight(state)) {
    const max = doorMax(state);
    if (door.hp < max) door.hp = Math.min(max, door.hp + max * RR.DOOR_REGEN_PER_SEC * T.TICK_SEC);
  }
  const raid = state.raid;
  if (!raid || !raid.active) return;

  // 1) 이동
  for (const z of raid.zombies) {
    if (z.phase !== 'approach') continue;
    z.t += T.TICK_SEC;
    if (z.t >= z.arrive - EPS) {
      z.phase = raid.breached ? 'inside' : 'door';
      z.order = raid.nextOrder++;
    }
  }

  // 2) 방어: 가장 앞(먼저 도착한) 좀비부터
  const front = raid.zombies.filter((z) => z.phase !== 'approach').sort((a, b) => a.order - b.order);
  let dmg = defenseDps(state) * T.TICK_SEC;
  for (const z of front) {
    if (dmg <= 0) break;
    const d = Math.min(dmg, z.hp);
    z.hp -= d;
    dmg -= d;
  }
  const before = raid.zombies.length;
  raid.zombies = raid.zombies.filter((z) => z.hp > EPS);
  raid.killed += before - raid.zombies.length;
  state.stats.killed += before - raid.zombies.length;

  // 3) 방폭문 공격
  if (!raid.breached) {
    let dps = 0;
    for (const z of raid.zombies) if (z.phase === 'door') dps += Z[z.type].doorDps;
    if (dps > 0) {
      if (!raid.doorHitLogged) {
        raid.doorHitLogged = true;
        pushLog(state, 'log.doorHit', null);
        pushEvent(state, 'toast.doorHit', null);
      }
      door.hp -= dps * T.TICK_SEC;
      if (isPracticeDay(raid.day)) door.hp = Math.max(CONFIG.TUTORIAL.PRACTICE_DOOR_MIN_HP, door.hp); // 연습 습격: 안 부서짐
      if (door.hp <= 0) {
        door.hp = 0;
        raid.breached = true;
        for (const z of raid.zombies) if (z.phase === 'door') z.phase = 'inside';
        pushLog(state, 'log.breach', null);
        pushEvent(state, 'toast.breach', null);
      }
    }
  }

  // 4) 침입: 1층 방을 하나씩 고장 내고, 그 방에서 일하던 사람이 다친다
  const inside = raid.zombies.filter((z) => z.phase === 'inside');
  if (inside.length > 0) {
    const target = intrusionTarget(state);
    if (target) {
      // 그 방에 있던 사람: 접촉 시간(CONTACT_SEC) 동안 초당 -20, 그다음 대피
      for (const s of state.survivors) {
        if ((s.job !== 'room' && s.job !== 'build') || s.jobRef !== target.id) continue;
        s.hp = Math.max(0, s.hp - RR.CONTACT_DPS * T.TICK_SEC);
        s.contact = (s.contact || 0) + T.TICK_SEC;
        if (s.contact >= RR.CONTACT_SEC - EPS) { s.contact = 0; setRest(s); }
      }
      let dps = 0;
      for (const z of inside) dps += Z[z.type].doorDps;
      target.damage += dps * T.TICK_SEC;
      if (target.damage >= RR.ROOM_BREAK_HP - EPS) {
        target.damage = 0;
        target.broken = true;
        target.repairing = false;
        target.craft = null;
        pushLog(state, 'log.roomBroken', { floor: target.floor, room: target.type });
        pushEvent(state, 'toast.roomBroken', { room: target.type });
        recomputeGrid(state);
      }
    }
  }

  // 5) 다 처치하면 끝
  if (raid.zombies.length === 0) {
    raid.active = false;
    pushLog(state, 'log.raidRepelled', { n: raid.killed });
    pushEvent(state, 'toast.raidRepelled', null);
  }
}

/** 새벽(하루 시작) — 침입 중이면 전원이 싸워 처치하고 체력 -15, 아니면 남은 좀비는 물러간다 */
export function onDawn(state) {
  const raid = state.raid;
  if (!raid || !raid.active) return;
  if (raid.zombies.length > 0) {
    if (raid.breached) {
      for (const s of state.survivors) s.hp -= RR.DAWN_FIGHT_HP_LOSS;
      pushLog(state, 'log.dawnFight', { n: raid.zombies.length, hp: RR.DAWN_FIGHT_HP_LOSS });
      pushEvent(state, 'toast.dawnFight', null);
    } else {
      pushLog(state, 'log.retreat', { n: raid.zombies.length });
    }
  }
  raid.active = false;
  raid.zombies = [];
  raid.breached = false;
}

// ---------- 방폭문 강화 ----------
export function canUpgradeDoor(state) {
  const next = B.DOOR_LEVELS[state.door.level];
  if (!next) return { ok: false, reason: 'reason.maxLevel', params: null };
  const miss = missingCost(state, next.cost);
  return miss ? { ok: false, reason: 'reason.need', params: { need: miss } } : { ok: true };
}

/** 바로 강화. 최대 체력이 오른 만큼 현재 체력도 오른다 */
export function upgradeDoor(state) {
  const c = canUpgradeDoor(state);
  if (!c.ok) return c;
  const next = B.DOOR_LEVELS[state.door.level];
  spend(state, next.cost);
  const oldMax = doorMax(state);
  state.door.level++;
  state.door.hp += doorMax(state) - oldMax;
  pushLog(state, 'log.doorUpgrade', { level: state.door.level });
  return { ok: true };
}
