// 바닥 패드: 성주가 올라서면 은화가 초당 payPerSecond개씩 들어가고, 다 차면 해금
import { addBuilding } from './buildings.js';
import { resolveCollisions } from './commander.js';
import { spawnArchers } from './units.js';

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

function unlockPad(state, pad, balance) {
  const def = defOf(balance, pad.id);
  state.events.push({ type: 'unlock', padId: pad.id });
  if (def.builds) {
    addBuilding(state, def.builds, pad.x, pad.z, balance);
    state.unlocked[def.builds] = true;
    // 성주가 패드 위(=건물 자리)에 서 있었으면 바로 밀어낸다
    resolveCollisions(state, state.commander, balance.commander.radius, balance.map.halfSize);
  }
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
