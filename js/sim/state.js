// 게임 상태 만들기. 상태는 숫자·문자열·배열·평범한 객체만 담는다.
import { createRng, range } from './rng.js';
import { distToPolyline } from './collision.js';
import { spawnStartCoins } from './coins.js';
import { createPads, refreshPads } from './pads.js';
import { createCamps } from './camps.js';

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
    spawn: { startTick: 0, paused: false },
    camps: [],
    soldiers: [],
    soldierTurn: 0,
    kills: 0,
    walls: [],
    wallLevel: 0,
    result: null,
    stage: 1,
  };
  buildCliffs(state, balance);
  scatter(state, map, 'tree', map.trees);
  scatter(state, map, 'rock', map.rocks);
  spawnStartCoins(state, balance);
  state.camps = createCamps(state, balance);
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

/**
 * 절벽 (2026-11-10): 성벽 밖 길 양쪽을 바위 절벽(원 충돌체)으로 막아 좁은 길을 만든다.
 * 꺾이는 곳 안쪽이 길을 침범하면 건너뛴다.
 */
function buildCliffs(state, balance) {
  const cfg = balance.map.cliffs, map = balance.map;
  const W = balance.walls.half + cfg.stopOutsideWall;
  for (const p of state.paths) {
    const off = p.width / 2 + cfg.offset;
    for (let i = 0; i + 1 < p.points.length; i++) {
      const [ax, az] = p.points[i], [bx, bz] = p.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let t = 0; t <= len; t += cfg.spacing) {
        const cx = ax + dx * t, cz = az + dz * t;
        if (Math.max(Math.abs(cx - state.castle.x), Math.abs(cz - state.castle.z)) < W) continue;
        for (const side of [1, -1]) {
          const x = cx - dz * off * side, z = cz + dx * off * side;
          if (Math.abs(x) > map.halfSize - 0.3 || Math.abs(z) > map.halfSize - 0.3) continue;
          if (state.paths.some(q => distToPolyline(x, z, q.points) < q.width / 2 + cfg.radius * 0.95)) continue;
          if (state.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < cfg.spacing * 0.6)) continue;
          state.obstacles.push({ kind: 'cliff', x, z, r: cfg.radius, scale: 1, rot: (x * 7.1 + z * 3.3) % (Math.PI * 2) });
        }
      }
    }
  }
}
