// 디버그 전용: ?worst — 기획서 "성능 상한"의 최악 장면을 만든다 (게임 규칙에는 쓰지 않음)
import { range } from './rng.js';
import { spawnEnemy, spawnArchers } from './units.js';
import { spawnCoin } from './coins.js';
import { addBuilding } from './buildings.js';
import { buildWalls } from './walls.js';

export function makeWorstScene(state, balance) {
  const w = balance.debug.worst;
  const c = state.commander;
  state.spawn.paused = true; // 적 기지는 멈춤 (최악 장면 고정)
  // 기지 전체 (건물·망루 4·성벽) — 그리기 부담이 가장 큰 상태
  for (const def of balance.pads.list) {
    if (def.builds && balance.buildings[def.builds]) addBuilding(state, def.builds, def.x, def.z, balance);
    const p = state.pads.find(q => q.id === def.id);
    if (p && def.builds) p.done = true;
  }
  for (const b of state.buildings) if (b.kind === 'tower') b.upgraded = true;
  buildWalls(state, balance, 1);
  state.unlocked = { barracks: true, taxTable: true, walls: true, tower: true };
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
