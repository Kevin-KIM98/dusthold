// 디버그 전용: ?worst — 기획서 "성능 상한"의 최악 장면을 만든다 (게임 규칙에는 쓰지 않음)
import { range } from './rng.js';
import { spawnEnemy, spawnArchers } from './units.js';
import { spawnCoin } from './coins.js';

export function makeWorstScene(state, balance) {
  const w = balance.debug.worst;
  const c = state.commander;
  state.waves.current = balance.waves.total; // 일반 웨이브는 멈춤
  c.coins = w.carried;
  const saveMax = balance.archers.maxFollowers;
  balance.archers.maxFollowers = w.archers;
  spawnArchers(state, w.archers, c.x, c.z + 2, balance);
  balance.archers.maxFollowers = saveMax;
  const types = ['raider', 'raider', 'raider', 'shield'];
  for (let i = 0; i < w.enemies; i++) {
    const e = spawnEnemy(state, types[i % types.length], state.paths[i % state.paths.length].id, balance);
    const a = (i / w.enemies) * Math.PI * 2;
    const r = w.radius + range(state.rng, -2, 2);
    e.x = e.prevX = c.x + Math.cos(a) * r;
    e.z = e.prevZ = c.z + Math.sin(a) * r;
    e.wp = 99;
  }
  for (let i = 0; i < w.groundCoins; i++) {
    spawnCoin(state, c.x + range(state.rng, -w.radius, w.radius), c.z + range(state.rng, -w.radius, w.radius) + w.radius, true, balance);
  }
}
