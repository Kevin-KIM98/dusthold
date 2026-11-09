// 바닥 은화: 생성 · 수명 · 성주가 지나가면 줍기
import { range } from './rng.js';

export function spawnCoin(state, x, z, permanent = false, balance) {
  const ttl = permanent ? -1 : Math.round(balance.coins.lifetimeSeconds / balance.sim.tickSeconds);
  const coin = { id: state.nextId++, x, z, ttl };
  state.coins.push(coin);
  return coin;
}

/** 시작 자금: 정해진 자리 주변에 시드 랜덤으로 흩뿌림 (사라지지 않음) */
export function spawnStartCoins(state, balance) {
  const st = balance.coins.start;
  for (let i = 0; i < st.count; i++) {
    const a = range(state.rng, 0, Math.PI * 2);
    const r = st.spread * Math.sqrt(range(state.rng, 0, 1));
    spawnCoin(state, st.x + Math.cos(a) * r, st.z + Math.sin(a) * r, true, balance);
  }
}

export function updateCoins(state, balance) {
  const c = state.commander;
  const cfg = balance.coins;
  const r2 = cfg.pickupRadius * cfg.pickupRadius;
  const kept = [];
  for (const coin of state.coins) {
    if (coin.ttl > 0) coin.ttl -= 1;
    if (coin.ttl === 0) continue; // 수명 끝
    const dx = coin.x - c.x, dz = coin.z - c.z;
    if (c.alive && c.coins < cfg.carryMax && dx * dx + dz * dz <= r2) {
      c.coins += 1;
      state.events.push({ type: 'pickup', x: coin.x, z: coin.z });
      continue;
    }
    kept.push(coin);
  }
  state.coins = kept;
}
