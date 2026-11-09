// 바닥 은화: 생성 · 수명 · 성주가 지나가면 줍기
import { range } from './rng.js';

export function spawnCoin(state, x, z, permanent = false, balance) {
  // 기본은 사라지지 않음(-1). coins.expire=true + lifetimeSeconds가 있을 때만 수명
  const ttl = permanent || !balance.coins.expire ? -1 : Math.round(balance.coins.lifetimeSeconds / balance.sim.tickSeconds);
  // 바닥 은화가 많으면 가까운 은화에 합쳐 더미로 (돈은 그대로, 개수만 줄임)
  const cfg = balance.coins;
  if (cfg.mergeAbove && state.coins.length >= cfg.mergeAbove) {
    let best = null, bd = cfg.mergeRadius;
    for (const k of state.coins) {
      const d = Math.hypot(k.x - x, k.z - z);
      if (d <= bd) { bd = d; best = k; }
    }
    if (best) { best.value = (best.value || 1) + 1; return best; }
  }
  const coin = { id: state.nextId++, x, z, ttl, value: 1 };
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
      // 더미면 들 수 있는 만큼만 가져가고 나머지는 남김
      const take = Math.min(coin.value || 1, cfg.carryMax - c.coins);
      c.coins += take;
      coin.value = (coin.value || 1) - take;
      state.events.push({ type: 'pickup', x: coin.x, z: coin.z, n: take });
      if (coin.value > 0) kept.push(coin);
      continue;
    }
    kept.push(coin);
  }
  state.coins = kept;
}
