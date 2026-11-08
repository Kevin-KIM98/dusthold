// 자원·전력망·소비. DOM 금지.
// 전력망: 샤프트(1층부터 끊김 없이 이어진 것)에 가로로 바로 붙었거나, 완공된 방을 거쳐 이어진 방만 연결.
// 전력 부족: 우선순위 낮은 방부터 끈다. 꺼지거나 끊긴 방은 효과가 없다.

import { CONFIG } from '../config.js';
import { pushLog, pushEvent } from './log.js';
import { addResource } from './resources.js';
import { withRng } from './rng.js';
import { isInjured, setRest, workEfficiency } from './survivors.js';

export { addResource };

const B = CONFIG.BUNKER;
const ROOMS = B.ROOMS;
const T = CONFIG.TIME;
const SV = CONFIG.SURVIVOR;

/** roomId → 근무자 목록 */
export function workerMap(state) {
  const m = new Map();
  for (const s of state.survivors) {
    if (s.job !== 'room') continue;
    if (!m.has(s.jobRef)) m.set(s.jobRef, []);
    m.get(s.jobRef).push(s);
  }
  return m;
}

function efficiency(list, def) {
  let e = 0;
  for (const s of list || []) e += workEfficiency(s, def.specialty);
  return e;
}

/** 층별 col → 방 */
export function roomRows(state) {
  const rows = new Map();
  for (const r of state.bunker.rooms) {
    if (!rows.has(r.floor)) rows.set(r.floor, []);
    const row = rows.get(r.floor);
    for (let c = r.col; c < r.col + r.w; c++) row[c] = r;
  }
  return rows;
}

/** 1층부터 f층까지 샤프트가 전부 완공됐나 */
export function shaftReachesFloor(state, f) {
  if (f < 1) return false;
  const rows = roomRows(state);
  for (let k = 1; k <= f; k++) {
    const r = (rows.get(k) || [])[B.SHAFT_COL];
    if (!r || r.type !== 'shaft' || !r.done) return false;
  }
  return true;
}

/** 전력망·인구 상한·저장 상한을 다시 계산한다. 배치·완공 직후와 매 틱 호출. */
export function recomputeGrid(state) {
  const bk = state.bunker;
  const rows = roomRows(state);
  for (const r of bk.rooms) { r.connected = false; r.on = false; }

  // 1) 연결
  for (let f = 1; f <= bk.floors; f++) {
    const row = rows.get(f) || [];
    const shaft = row[B.SHAFT_COL];
    if (!shaft || shaft.type !== 'shaft' || !shaft.done) break;
    shaft.connected = true;
    for (const dir of [-1, 1]) {
      let c = B.SHAFT_COL + dir;
      while (c >= 0 && c < bk.cols) {
        const r = row[c];
        if (!r || !r.done) break;
        r.connected = true;
        c = dir < 0 ? r.col - 1 : r.col + r.w;
      }
    }
  }

  // 2) 생산
  const workers = workerMap(state);
  const working = (r) => r.done && r.connected && !r.broken;
  let produced = 0;
  for (const r of bk.rooms) {
    const def = ROOMS[r.type];
    if (!working(r) || def.use > 0) continue;
    r.on = true; // 전력을 안 쓰는 방(발전실·창고·샤프트)은 연결만 되면 켜짐
    if (def.perWorker) produced += def.perWorker * efficiency(workers.get(r.id), def);
  }

  // 3) 소비: 우선순위 순으로 줄 세우고 모자라면 뒤에서부터 끈다
  const prio = (r) => {
    const k = B.POWER_PRIORITY.indexOf(r.type);
    return k < 0 ? B.POWER_PRIORITY.length : k;
  };
  const consumers = bk.rooms.filter((r) => working(r) && ROOMS[r.type].use > 0)
    .sort((a, b) => prio(a) - prio(b) || a.id - b.id);
  let demand = 0;
  for (const r of consumers) { r.on = true; demand += ROOMS[r.type].use; }
  let used = demand;
  for (let k = consumers.length - 1; k >= 0 && used > produced; k--) {
    consumers[k].on = false;
    used -= ROOMS[consumers[k].type].use;
  }
  state.power = { produced, consumed: demand, used };

  // 4) 상한
  let pop = CONFIG.START.POP_CAP, cap = CONFIG.START.STORAGE_CAP;
  for (const r of bk.rooms) {
    if (!r.on) continue;
    const def = ROOMS[r.type];
    if (def.popCap) pop += def.popCap;
    if (def.storageCap) cap += def.storageCap;
  }
  state.popCap = pop;
  state.storageCap = cap;
}

/** 입구 대기 생존자를 인구 상한까지 입주시킨다 */
export function admitWaiting(state) {
  while (state.waiting.length > 0 && state.survivors.length < state.popCap) {
    const s = state.waiting.shift();
    state.survivors.push(s);
    pushLog(state, 'log.joined', { name: s.name });
  }
}

function stepProduction(state) {
  const workers = workerMap(state);
  for (const r of state.bunker.rooms) {
    if (!r.on) continue;
    const def = ROOMS[r.type];
    const list = workers.get(r.id);
    if (def.produce) {
      const e = efficiency(list, def);
      if (e <= 0) continue;
      r.acc += (def.produce.perDay / T.DAY_SEC) * T.TICK_SEC * e;
      if (r.acc >= 1) {
        const n = Math.floor(r.acc);
        r.acc -= n;
        addResource(state, def.produce.res, n);
      }
    } else if (def.healPerDay) {
      const e = efficiency(list, def);
      if (e <= 0) continue;
      const heal = (def.healPerDay / T.DAY_SEC) * T.TICK_SEC * e;
      for (const s of state.survivors) if (s.hp < SV.HP) s.hp = Math.min(SV.HP, s.hp + heal);
    }
  }
}

/** 부상자는 일 못 함 → 방·공사·채집에서 뺀다 */
function releaseInjured(state) {
  for (const s of state.survivors) {
    if (isInjured(s) && (s.job === 'room' || s.job === 'build' || s.job === 'gather')) setRest(s);
  }
}

/** 체력 0 이하 = 사망 */
export function removeDead(state) {
  const dead = state.survivors.filter((s) => s.hp <= 0);
  if (dead.length === 0) return 0;
  const ids = new Set(dead.map((s) => s.id));
  state.survivors = state.survivors.filter((s) => !ids.has(s.id));
  for (const exp of state.surface.expeditions) exp.members = exp.members.filter((id) => !ids.has(id));
  state.surface.expeditions = state.surface.expeditions.filter((e) => e.members.length > 0);
  for (const s of dead) {
    pushLog(state, 'log.death', { name: s.name });
    pushEvent(state, 'toast.death', { name: s.name });
  }
  return dead.length;
}

/** 매 틱 호출 */
export function step(state) {
  releaseInjured(state);
  recomputeGrid(state);
  stepProduction(state);
  removeDead(state);
  admitWaiting(state);
}

/** 내일 아침 정산에 모자라나 */
export function shortageForDawn(state) {
  const n = state.survivors.length;
  return {
    food: Math.floor(state.resources.food) < n * SV.FOOD_PER_DAY,
    water: Math.floor(state.resources.water) < n * SV.WATER_PER_DAY,
  };
}

/** 밤 시작: 굶주림 경고 */
export function onNightStart(state) {
  const sh = shortageForDawn(state);
  if (sh.food || sh.water) pushEvent(state, 'toast.hungerWarn', null);
}

/** 새벽(하루 시작) 정산: 1인당 식량 2·물 2. 모자란 인원은 각각 체력 -30 */
export function onDawn(state) {
  const n = state.survivors.length;
  if (n === 0) return;
  for (const [res, per] of [['food', SV.FOOD_PER_DAY], ['water', SV.WATER_PER_DAY]]) {
    const have = Math.floor(state.resources[res]);
    const fed = Math.min(n, Math.floor(have / per));
    state.resources[res] -= fed * per;
    const short = n - fed;
    if (short <= 0) continue;
    const victims = withRng(state, (rng) => rng.shuffle(state.survivors).slice(0, short));
    for (const s of victims) s.hp -= SV.STARVE_HP_LOSS;
    pushLog(state, 'log.starve', { res, n: short, hp: SV.STARVE_HP_LOSS });
    pushEvent(state, 'toast.starve', { res });
  }
  removeDead(state);
}

/** 상단 바용 요약. low = 부족(빨간색) */
export function summarize(state) {
  const n = state.survivors.length;
  const r = state.resources;
  const needFood = n * SV.FOOD_PER_DAY;
  const needWater = n * SV.WATER_PER_DAY;
  return {
    food: { value: r.food, low: r.food < needFood },
    water: { value: r.water, low: r.water < needWater },
    wood: { value: r.wood, low: r.wood <= 0 },
    scrap: { value: r.scrap, low: r.scrap <= 0 },
    power: {
      produced: state.power.produced,
      consumed: state.power.consumed,
      low: state.power.consumed > state.power.produced,
    },
    parts: { value: r.parts, low: false },
    pop: { count: n, cap: state.popCap, low: n > state.popCap, waiting: state.waiting.length },
  };
}
