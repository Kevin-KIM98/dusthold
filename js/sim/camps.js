// 적 기지 (기획서 ③, 2026-11-10 개편): 길 끝 기지에서 적이 끝없이 나온다. 부수면 점령.
import { next, range } from './rng.js';
import { stageScale } from './scale.js';
import { spawnEnemy } from './units.js';
import { spawnCoin } from './coins.js';

const ticksOf = (s, balance) => Math.round(s / balance.sim.tickSeconds);

/** 길마다 기지 하나: 길 시작점에서 안쪽으로 inset m */
export function createCamps(state, balance) {
  const cfg = balance.camps;
  const sc = stageScale(state.stage, balance);
  const start = state.spawn ? state.spawn.startTick : 0;
  return state.paths.map((p, i) => {
    const [ax, az] = p.points[0], [bx, bz] = p.points[1];
    const len = Math.hypot(bx - ax, bz - az) || 1, dx = (bx - ax) / len, dz = (bz - az) / len;
    const hp = Math.round(cfg.hp * sc.hp);
    return {
      id: state.nextId++, pathId: p.id,
      x: ax + dx * cfg.inset, z: az + dz * cfg.inset,
      // 적이 나오는 곳 = 기지 앞(성채 쪽)
      sx: ax + dx * (cfg.inset + cfg.spawnFront), sz: az + dz * (cfg.inset + cfg.spawnFront),
      halfWidth: cfg.halfSize, halfDepth: cfg.halfSize,
      hp, maxHp: hp, captured: false,
      nextTick: start + ticksOf(cfg.startDelaySeconds + i * 0.7, balance),
      giantTick: start + ticksOf(cfg.giantFirstSeconds + i * 5, balance),
    };
  });
}

/** 스테이지가 시작된 뒤 흐른 초 */
export function stageSeconds(state, balance) {
  return (state.tick - state.spawn.startTick) * balance.sim.tickSeconds;
}

/** 지금 나오는 간격(초)과 방패 약탈자 확률 — 시간이 갈수록 빨라지고 단단해짐 */
export function spawnRate(state, balance) {
  const cfg = balance.camps;
  const u = Math.max(0, Math.min(1, (stageSeconds(state, balance) - cfg.startDelaySeconds) / cfg.rampSeconds));
  const sc = stageScale(state.stage, balance);
  return {
    interval: (cfg.intervalStart + (cfg.intervalMin - cfg.intervalStart) * u) / sc.spawn,
    shield: cfg.shieldStart + (cfg.shieldMax - cfg.shieldStart) * u,
  };
}

export function updateCamps(state, balance) {
  if (state.spawn.paused) return;
  const cfg = balance.camps;
  const rate = spawnRate(state, balance);
  for (const c of state.camps) {
    if (c.captured) continue;
    const room = state.enemies.length < cfg.maxAlive;
    if (state.tick >= c.giantTick) {
      if (room) spawnEnemy(state, 'giant', c.pathId, balance, 0, c.sx, c.sz);
      c.giantTick = state.tick + ticksOf(cfg.giantEverySeconds, balance);
    }
    if (state.tick >= c.nextTick) {
      if (room) {
        const type = next(state.rng) < rate.shield ? 'shield' : 'raider';
        // 기지 앞에서 살짝 흩어져 나옴
        spawnEnemy(state, type, c.pathId, balance, 0, c.sx + range(state.rng, -0.6, 0.6), c.sz + range(state.rng, -0.6, 0.6));
      }
      c.nextTick = state.tick + Math.max(1, ticksOf(rate.interval, balance));
    }
  }
}

/** 기지 체력 0 → 점령: 더는 안 나오고 은화가 쏟아짐 */
export function captureCamp(state, camp, balance) {
  camp.captured = true;
  camp.hp = 0;
  const cfg = balance.camps;
  for (let i = 0; i < cfg.captureCoins; i++) {
    const a = range(state.rng, 0, Math.PI * 2), r = cfg.captureSpread * Math.sqrt(range(state.rng, 0, 1));
    spawnCoin(state, camp.sx + Math.cos(a) * r, camp.sz + Math.sin(a) * r, false, balance);
  }
  state.events.push({ type: 'campCaptured', id: camp.id, x: camp.x, z: camp.z, left: state.camps.filter(c => !c.captured).length });
}
