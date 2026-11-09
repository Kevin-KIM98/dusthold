// 게임 상태 만들기. 상태는 숫자·문자열·배열·평범한 객체만 담는다.
import { createRng, range } from './rng.js';
import { distToPolyline } from './collision.js';
import { spawnStartCoins } from './coins.js';
import { createPads, refreshPads } from './pads.js';
import { createWaves } from './waves.js';

export function createState(balance, seed) {
  const map = balance.map;
  const rng = createRng(seed);
  const start = map.commanderStart;
  const state = {
    seed,
    tick: 0,
    time: 0,
    rng,
    commander: {
      x: start.x, z: start.z, angle: start.angle,
      prevX: start.x, prevZ: start.z, prevAngle: start.angle,
      hp: balance.commander.hp,
      moving: false,
      coins: 0,
      alive: true,
      respawn: 0,
      cooldown: 0,
      trail: [[start.x, start.z]],
    },
    castle: { ...map.castle, hp: balance.castle.hp, maxHp: balance.castle.hp },
    paths: map.paths.map(p => ({ id: p.id, width: p.width, points: p.points.map(pt => [pt[0], pt[1]]) })),
    obstacles: [],
    nextId: 1,
    events: [],
    coins: [],
    pads: createPads(balance),
    buildings: [],
    unlocked: {},
    archers: [],
    enemies: [],
    waves: createWaves(),
    kills: 0,
    walls: [],
    wallLevel: 0,
    result: null,
    stage: 1,
  };
  scatter(state, map, 'tree', map.trees);
  scatter(state, map, 'rock', map.rocks);
  spawnStartCoins(state, balance);
  refreshPads(state, balance);
  return state;
}

// 나무·바위를 길·성채·시작 위치를 피해 흩뿌린다 (시드 고정이면 항상 같은 배치)
function scatter(state, map, kind, cfg) {
  const lim = map.halfSize - cfg.radius * cfg.maxScale;
  const start = map.commanderStart;
  let placed = 0;
  for (let tries = 0; placed < cfg.count && tries < cfg.maxTries; tries++) {
    const x = range(state.rng, -lim, lim);
    const z = range(state.rng, -lim, lim);
    const scale = range(state.rng, cfg.minScale, cfg.maxScale);
    const r = cfg.radius * scale;
    // 성채 주변 네모 구역(성벽 안쪽 + 여유)은 비워 둔다
    if (Math.max(Math.abs(x - state.castle.x), Math.abs(z - state.castle.z)) < cfg.keepOffCastle) continue;
    if (Math.hypot(x - start.x, z - start.z) < cfg.keepOffCastle) continue;
    let ok = true;
    for (const p of state.paths) {
      if (distToPolyline(x, z, p.points) < p.width / 2 + cfg.keepOffPath + r) { ok = false; break; }
    }
    if (!ok) continue;
    for (const p of state.pads) {
      if (Math.hypot(x - p.x, z - p.z) < p.half * Math.SQRT2 + cfg.keepOffPad + r) { ok = false; break; }
    }
    if (!ok) continue;
    for (const o of state.obstacles) {
      if (Math.hypot(x - o.x, z - o.z) < o.r + r + cfg.minGap) { ok = false; break; }
    }
    if (!ok) continue;
    const rot = range(state.rng, 0, Math.PI * 2);
    state.obstacles.push({ kind, x, z, r, scale, rot });
    placed++;
  }
}
