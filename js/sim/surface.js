// 지상: 맵 생성·안개·탐험·원정·채집. DOM 금지 (Node에서 테스트).
import { CONFIG } from '../config.js';
import { createRng, withRng } from './rng.js';
import { pushLog, pushEvent } from './log.js';
import { isNight, secToTicks, DAY_TICKS } from './clock.js';
import { makeSurvivor, isAvailable, isInjured, combatPower, findSurvivor, setRest } from './survivors.js';
import { addResource } from './resources.js';

const S = CONFIG.SURFACE;
const TILES = S.TILES;
const CB = CONFIG.COMBAT;
const T = CONFIG.TIME;

// ---------- 좌표 ----------
export function tileIndex(size, x, y) {
  return y * size + x;
}
export function tileXY(size, i) {
  return { x: i % size, y: Math.floor(i / size) };
}
export function centerIndex(size) {
  const c = (size - 1) / 2;
  return tileIndex(size, c, c);
}
/** 8방향 이웃 */
export function neighbors(size, i) {
  const { x, y } = tileXY(size, i);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) out.push(tileIndex(size, nx, ny));
    }
  }
  return out;
}

// ---------- 맵 생성 ----------
function weightedPick(rng, weights) {
  const keys = Object.keys(weights);
  let total = 0;
  for (const k of keys) total += weights[k];
  let r = rng.next() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r < 0) return k;
  }
  return keys[keys.length - 1];
}

/** 시드만으로 결정되는 맵. 상태에는 surface로 들어간다. */
export function generateMap(seed) {
  const n = S.SIZE;
  const c = (n - 1) / 2;
  const rng = createRng(((Number(seed) >>> 0) ^ S.MAP_SEED_SALT) >>> 0);
  const tiles = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const ring = Math.max(Math.abs(x - c), Math.abs(y - c));
      tiles.push({ type: ring === 0 ? 'entrance' : null, ring, revealed: ring <= S.START_REVEAL_RING, deposit: null, cleared: false, acc: 0 });
    }
  }
  const free = (pred) => tiles.map((t, i) => i).filter((i) => tiles[i].type === null && pred(tiles[i]));

  // 1) 개수가 고정된 타일 (군 기지)
  for (const type of Object.keys(TILES)) {
    const def = TILES[type];
    if (!def.count) continue;
    const cand = rng.shuffle(free((t) => t.ring >= def.minRing && t.ring <= (def.maxRing || def.minRing)));
    for (let k = 0; k < def.count && k < cand.length; k++) tiles[cand[k]].type = type;
  }
  // 2) 시작 8칸 보장 (숲·폐허·농지 1개씩)
  const ring1 = rng.shuffle(free((t) => t.ring === S.START_REVEAL_RING));
  S.START_GUARANTEE.forEach((type, k) => { if (ring1[k] !== undefined) tiles[ring1[k]].type = type; });
  // 3) 나머지는 링별 비율로
  for (const i of free(() => true)) tiles[i].type = weightedPick(rng, S.RING_WEIGHTS[tiles[i].ring]);
  // 4) 매장량
  for (const t of tiles) {
    const def = TILES[t.type];
    if (def && def.gather) t.deposit = def.deposit;
  }
  return { size: n, tiles, expeditions: [], nextExpeditionId: 1, rev: 0 };
}

// ---------- 조회 ----------
export function getTile(state, i) {
  return state.surface.tiles[i] || null;
}

/** 필요 전투력 (config) */
export function requiredPower(tile) {
  const def = TILES[tile.type];
  if (!def) return 0;
  if (def.powerRequired !== undefined) return def.powerRequired;
  if (def.powerPerRing !== undefined) return def.powerPerRing * tile.ring;
  return 0;
}

export function isCombatTile(tile) {
  return requiredPower(tile) > 0;
}

export function isGatherable(tile) {
  const def = TILES[tile.type];
  return !!(def && def.gather);
}

export function isDepleted(tile) {
  return tile.deposit !== null && tile.deposit <= 0;
}

export function expeditionSec(tile) {
  return S.EXPEDITION_SEC_PER_RING * tile.ring;
}

export function expeditionAt(state, i) {
  return state.surface.expeditions.find((e) => e.tile === i) || null;
}

export function gatherersAt(state, i) {
  return state.survivors.filter((s) => s.job === 'gather' && s.jobTile === i);
}

function fail(reason, params) {
  return { ok: false, reason, params: params || null };
}
const OK = Object.freeze({ ok: true });

export function canExplore(state, i) {
  const tile = getTile(state, i);
  if (!tile || tile.revealed) return fail('reason.notFog');
  const size = state.surface.size;
  if (!neighbors(size, i).some((j) => state.surface.tiles[j].revealed)) return fail('reason.notAdjacent');
  if (expeditionAt(state, i)) return fail('reason.busy');
  return OK;
}

export function canAttack(state, i) {
  const tile = getTile(state, i);
  if (!tile || !tile.revealed) return fail('reason.notRevealed');
  if (!isCombatTile(tile)) return fail('reason.notTarget');
  if (tile.cleared) return fail('reason.cleared');
  if (expeditionAt(state, i)) return fail('reason.busy');
  return OK;
}

export function canGather(state, i) {
  const tile = getTile(state, i);
  if (!tile || !tile.revealed) return fail('reason.notRevealed');
  if (!isGatherable(tile)) return fail('reason.notGatherable');
  if (isDepleted(tile)) return fail('reason.exhausted');
  if (isNight(state)) return fail('reason.night');
  return OK;
}

export function validateMembers(state, ids) {
  if (!Array.isArray(ids) || ids.length < S.EXPEDITION_MIN) return fail('reason.noMembers');
  if (ids.length > S.EXPEDITION_MAX) return fail('reason.tooMany', { max: S.EXPEDITION_MAX });
  if (new Set(ids).size !== ids.length) return fail('reason.unavailable');
  for (const id of ids) {
    const s = findSurvivor(state, id);
    if (!s || !isAvailable(s)) return fail('reason.unavailable');
  }
  return OK;
}

export function partyPower(state, ids) {
  let p = 0;
  for (const id of ids) {
    const s = findSurvivor(state, id);
    if (s) p += combatPower(s);
  }
  return p;
}

// ---------- 행동 ----------
/** kind: 'explore' | 'attack' */
export function startExpedition(state, i, ids, kind) {
  const check = kind === 'attack' ? canAttack(state, i) : canExplore(state, i);
  if (!check.ok) return check;
  const mv = validateMembers(state, ids);
  if (!mv.ok) return mv;
  const tile = getTile(state, i);
  for (const id of ids) {
    const s = findSurvivor(state, id);
    s.job = 'expedition';
    s.jobTile = i;
  }
  const gear = ids.some((id) => findSurvivor(state, id).gear);
  const ticks = secToTicks(expeditionSec(tile) * (gear ? CONFIG.BUNKER.GEAR_TIME_MULT : 1));
  state.surface.expeditions.push({ id: state.surface.nextExpeditionId++, tile: i, kind, members: ids.slice(), ticksLeft: ticks, totalTicks: ticks });
  pushLog(state, 'log.depart', { tile: tile.revealed ? tile.type : 'fog', ring: tile.ring, n: ids.length });
  return OK;
}

export function assignGatherer(state, survivorId, i) {
  const check = canGather(state, i);
  if (!check.ok) return check;
  const s = findSurvivor(state, survivorId);
  if (!s || !isAvailable(s)) return fail('reason.unavailable');
  s.job = 'gather';
  s.jobTile = i;
  return OK;
}

export function unassign(state, survivorId) {
  const s = findSurvivor(state, survivorId);
  if (!s || s.job !== 'gather') return fail('reason.unavailable');
  setRest(s);
  return OK;
}

// ---------- 보상 ----------
function giveRewards(state, reward) {
  const got = {};
  for (const res of Object.keys(reward)) got[res] = addResource(state, res, reward[res]);
  return got;
}

function resolveExplore(state, exp, tile, rng) {
  tile.revealed = true;
  const def = TILES[tile.type];
  if (def.reward) {
    const got = giveRewards(state, def.reward);
    pushLog(state, 'log.exploreDone', { tile: tile.type, reward: got });
  } else if (def.randomReward) {
    const rr = def.randomReward;
    const got = giveRewards(state, { [rng.pick(rr.pool)]: rng.int(rr.min, rr.max) });
    tile.cleared = true;
    pushLog(state, 'log.exploreDone', { tile: tile.type, reward: got });
  } else if (def.survivors) {
    const count = rng.int(def.survivors.min, def.survivors.max);
    const joined = [];
    let waited = 0;
    for (let k = 0; k < count; k++) {
      const s = makeSurvivor(state, rng);
      if (state.survivors.length < state.popCap) state.survivors.push(s);
      else { state.waiting.push(s); waited++; }
      joined.push(s.name);
    }
    tile.cleared = true;
    pushLog(state, 'log.camp', { names: joined });
    if (waited > 0) pushLog(state, 'log.campWait', { n: waited });
  } else if (isCombatTile(tile)) {
    pushLog(state, 'log.found', { tile: tile.type, need: requiredPower(tile) });
  }
}

function resolveAttack(state, exp, tile, rng) {
  const def = TILES[tile.type];
  const need = requiredPower(tile);
  const power = partyPower(state, exp.members);
  if (power >= need) {
    tile.cleared = true;
    const got = giveRewards(state, def.clearReward);
    pushLog(state, tile.type === 'base' ? 'log.baseCleared' : 'log.nestCleared', { tile: tile.type, reward: got });
    if (power < need * (1 + CB.CLOSE_FIGHT_MARGIN)) {
      const s = findSurvivor(state, rng.pick(exp.members));
      if (s) {
        s.hp = Math.max(0, s.hp - CB.CLOSE_FIGHT_HP_LOSS);
        pushLog(state, 'log.closeFight', { name: s.name, n: CB.CLOSE_FIGHT_HP_LOSS });
      }
    }
  } else {
    for (const id of exp.members) {
      const s = findSurvivor(state, id);
      if (s) s.hp = Math.min(s.hp, CONFIG.SURVIVOR.INJURED_HP);
    }
    pushLog(state, 'log.attackFailed', { tile: tile.type });
    pushEvent(state, 'toast.attackFailed', null);
  }
}

function finishExpedition(state, exp) {
  const tile = getTile(state, exp.tile);
  for (const id of exp.members) {
    const s = findSurvivor(state, id);
    if (s) setRest(s);
  }
  withRng(state, (rng) => {
    if (exp.kind === 'attack') resolveAttack(state, exp, tile, rng);
    else resolveExplore(state, exp, tile, rng);
  });
  state.surface.rev++;
  pushEvent(state, 'toast.returned', { tile: tile.type });
}

// ---------- 틱 ----------
function stepExpeditions(state) {
  const list = state.surface.expeditions;
  for (let k = 0; k < list.length; k++) {
    const exp = list[k];
    exp.ticksLeft--;
    if (exp.ticksLeft <= 0) {
      list.splice(k, 1);
      k--;
      finishExpedition(state, exp);
    }
  }
}

function stepGathering(state) {
  const active = new Set();
  for (const s of state.survivors) {
    if (s.job !== 'gather') continue;
    const tile = getTile(state, s.jobTile);
    if (!tile || !isGatherable(tile) || isDepleted(tile) || isInjured(s)) { setRest(s); continue; }
    const g = TILES[tile.type].gather;
    const bonus = (s.specialty === 'gather' ? 1 + S.GATHER_SPECIALTY_BONUS : 1) * (s.tool ? 1 + CONFIG.BUNKER.TOOL_SPEED_BONUS : 1);
    tile.acc += (g.perDay / T.DAY_SEC) * T.TICK_SEC * bonus;
    active.add(s.jobTile);
  }
  for (const i of active) {
    const tile = getTile(state, i);
    if (tile.acc < 1) continue;
    let amount = Math.floor(tile.acc);
    tile.acc -= amount;
    if (tile.deposit !== null) amount = Math.min(amount, tile.deposit);
    const added = addResource(state, TILES[tile.type].gather.res, amount);
    if (tile.deposit !== null) {
      tile.deposit -= added;
      if (tile.deposit <= 0) {
        tile.deposit = 0;
        tile.acc = 0;
        for (const s of gatherersAt(state, i)) setRest(s);
        pushLog(state, 'log.exhausted', { tile: tile.type });
        state.surface.rev++;
      }
    }
  }
}

/** 매 틱 */
export function step(state) {
  stepExpeditions(state);
  stepGathering(state);
}

/** 밤 시작 시 time.js가 부른다: 지상 채집 인원 자동 귀환 */
export function onNightStart(state) {
  let n = 0;
  for (const s of state.survivors) {
    if (s.job === 'gather') { setRest(s); n++; }
  }
  if (n > 0) {
    pushLog(state, 'log.gatherersReturn', { n });
    pushEvent(state, 'toast.gatherersReturn', null);
  }
  return n;
}

/** 하루 채집 기대량 (패널 표시용) */
export function gatherPerDay(tile) {
  return TILES[tile.type].gather.perDay;
}

export { DAY_TICKS };
