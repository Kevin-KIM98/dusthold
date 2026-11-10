// 바닥 패드: 성주가 올라서면 은화가 초당 payPerSecond개씩 들어가고, 다 차면 해금
import { addBuilding } from './buildings.js';
import { resolveCollisions } from './commander.js';
import { spawnArchers } from './units.js';
import { buildWalls } from './walls.js';

export function createPads(balance) {
  return balance.pads.list.map(def => ({
    id: def.id, x: def.x, z: def.z, half: balance.pads.halfSize,
    cost: def.cost, paid: 0, uses: 0, done: false, open: false, payAcc: 0,
  }));
}

function defOf(balance, id) { return balance.pads.list.find(d => d.id === id); }

/** 패드가 열려 있는지 다시 계산 (조건 해금·반복 패드 상한) */
export function refreshPads(state, balance) {
  for (const pad of state.pads) {
    const def = defOf(balance, pad.id);
    const reqOk = def.requires.every(r => state.unlocked[r]);
    let open = reqOk && !pad.done;
    if (def.archersPerUse && state.archers.length >= balance.archers.maxFollowers) open = false;
    if (def.upgradeTowers) {
      const towers = state.buildings.filter(b => b.kind === 'tower');
      if (towers.length < (def.minTowers || 1) || !towers.some(b => !b.upgraded)) open = false;
    }
    // 같은 자리를 쓰는 다른 패드가 아직 열려 있으면 숨김 (성벽 → 돌벽)
    if (def.sharesSpotWith && !state.pads.find(p => p.id === def.sharesSpotWith).done) open = false;
    pad.open = open;
  }
}

export function isOnPad(pad, x, z) {
  return Math.abs(x - pad.x) <= pad.half && Math.abs(z - pad.z) <= pad.half;
}

export function updatePads(state, balance) {
  const c = state.commander;
  const perTick = balance.pads.payPerSecond * balance.sim.tickSeconds;
  for (const pad of state.pads) {
    if (!pad.open || !c.alive || !isOnPad(pad, c.x, c.z)) { pad.payAcc = 0; continue; }
    pad.payAcc += perTick;
    const n = Math.floor(pad.payAcc + 1e-9);
    pad.payAcc -= n;
    const k = Math.min(n, c.coins, pad.cost - pad.paid);
    if (k <= 0) continue;
    c.coins -= k;
    pad.paid += k;
    state.events.push({ type: 'pay', padId: pad.id, n: k });
    if (pad.paid >= pad.cost) unlockPad(state, pad, balance);
  }
}

/** 새로 생긴 벽·건물 안에 갇힌 아군을 밀어낸다 */
function resolveAllies(state, balance) {
  resolveCollisions(state, state.commander, balance.commander.radius, balance.map.halfSize);
  for (const a of state.archers) resolveCollisions(state, a, balance.archers.radius, balance.map.halfSize);
}

function unlockPad(state, pad, balance) {
  const def = defOf(balance, pad.id);
  state.events.push({ type: 'unlock', padId: pad.id });
  if (def.builds === 'walls' || def.builds === 'stoneWalls') {
    // 성벽 재건이면 지금 단계 그대로, 처음이면 목책(1), 돌벽 패드면 2
    const level = def.builds === 'stoneWalls' ? 2 : pad.rebuild && state.wallLevel > 0 ? state.wallLevel : 1;
    buildWalls(state, balance, level);
    state.unlocked[def.builds] = true;
    resolveAllies(state, balance);
  } else if (def.builds) {
    addBuilding(state, def.builds, pad.x, pad.z, balance);
    state.unlocked[def.builds] = true;
    // 성주가 패드 위(=건물 자리)에 서 있었으면 바로 밀어낸다
    resolveCollisions(state, state.commander, balance.commander.radius, balance.map.halfSize);
  }
  if (def.upgradeTowers) {
    const t = state.buildings.find(b => b.kind === 'tower' && !b.upgraded);
    if (t) { t.upgraded = true; state.events.push({ type: 'towerUpgrade', id: t.id, x: t.x, z: t.z }); }
  }
  if (pad.rebuild) { pad.rebuild = false; pad.cost = def.cost; } // 재건 끝 → 원래 비용으로 (다시 부서지면 또 절반)
  if (def.repeat) {
    pad.uses += 1;
    pad.cost = def.cost + def.costStep * pad.uses;
    pad.paid = 0;
    pad.payAcc = 0;
    if (def.archersPerUse) {
      // 막사 앞에서 궁수가 나와 성주에게 달려간다
      const bar = state.buildings.find(b => b.kind === 'barracks');
      const sx = bar ? bar.x : pad.x;
      const sz = bar ? bar.z + bar.halfDepth + balance.archers.spawnFront : pad.z;
      spawnArchers(state, def.archersPerUse, sx, sz, balance);
    }
  } else {
    pad.done = true;
  }
  refreshPads(state, balance);
}
