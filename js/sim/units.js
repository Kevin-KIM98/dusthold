// 유닛 이동: 따라다니는 궁수 · 적(길 따라 성채로, 가까운 아군은 공격하러 다가감)
import { resolveCollisions } from './commander.js';
import { pushOutOfBox } from './collision.js';

// ── 궁수 ──────────────────────────────────────────────
export function spawnArchers(state, n, x, z, balance) {
  const cfg = balance.archers;
  const room = cfg.maxFollowers - state.archers.length;
  for (let i = 0; i < Math.min(n, room); i++) {
    const a = {
      id: state.nextId++, x: x + (i - 1) * 0.6, z, angle: 0, hp: cfg.hp, maxHp: cfg.hp,
      cooldown: 0, moving: false,
    };
    a.prevX = a.x; a.prevZ = a.z; a.prevAngle = a.angle;
    state.archers.push(a);
  }
  state.events.push({ type: 'archersJoin', n: Math.min(n, room), x, z });
}

/** 궁수 i번의 대열 자리: 성주 뒤 perRow명씩 줄 */
export function archerSlot(state, i, balance) {
  const cfg = balance.archers;
  const c = state.commander;
  const row = Math.floor(i / cfg.perRow), col = (i % cfg.perRow) - (cfg.perRow - 1) / 2;
  const fx = Math.sin(c.angle), fz = Math.cos(c.angle);
  const side = col * cfg.slotSide, back = cfg.slotBack + row * cfg.slotRow;
  return { x: c.x + fz * side - fx * back, z: c.z - fx * side - fz * back };
}

export function updateArchers(state, balance) {
  const cfg = balance.archers;
  const dt = balance.sim.tickSeconds;
  state.archers.forEach((a, i) => {
    a.prevX = a.x; a.prevZ = a.z; a.prevAngle = a.angle;
    a.moving = false;
    if (!state.commander.alive) return; // 성주가 쓰러져 있으면 제자리
    const s = archerSlot(state, i, balance);
    const dx = s.x - a.x, dz = s.z - a.z, d = Math.hypot(dx, dz);
    if (d < 0.15) return;
    const stepLen = Math.min(d, cfg.speed * dt);
    a.x += dx / d * stepLen; a.z += dz / d * stepLen;
    a.angle = Math.atan2(dx, dz);
    a.moving = true;
    resolveCollisions(state, a, cfg.radius, balance.map.halfSize);
  });
}

// ── 적 ────────────────────────────────────────────────
export function spawnEnemy(state, type, pathId, balance, wave = 0) {
  const t = balance.enemies.types[type];
  const path = state.paths.find(p => p.id === pathId);
  const [x, z] = path.points[0];
  const e = {
    id: state.nextId++, type, pathId, wave, wp: 1,
    x, z, prevX: x, prevZ: z, angle: 0, prevAngle: 0,
    hp: t.hp, maxHp: t.hp, cooldown: 0, moving: false, attacking: false,
  };
  state.enemies.push(e);
  state.events.push({ type: 'enemySpawn', id: e.id, enemy: type, x, z });
  return e;
}

/** 이 적이 지금 공격할 대상 — 2m 안 가장 가까운 아군(성주·궁수), 없으면 null */
export function enemyAllyTarget(state, e, balance) {
  const aggro = balance.enemies.aggroRange;
  let best = null, bestD = Infinity;
  const c = state.commander;
  if (c.alive) {
    const d = Math.hypot(c.x - e.x, c.z - e.z) - balance.commander.radius;
    if (d <= aggro && d < bestD) { best = { kind: 'commander', obj: c, r: balance.commander.radius }; bestD = d; }
  }
  for (const a of state.archers) {
    const d = Math.hypot(a.x - e.x, a.z - e.z) - balance.archers.radius;
    if (d <= aggro && d < bestD) { best = { kind: 'archer', obj: a, r: balance.archers.radius }; bestD = d; }
  }
  return best;
}

/** 적 중심에서 성채 사각형 가장자리까지 거리 */
export function distToCastle(state, e) {
  const k = state.castle;
  const cx = Math.max(k.x - k.halfWidth, Math.min(k.x + k.halfWidth, e.x));
  const cz = Math.max(k.z - k.halfDepth, Math.min(k.z + k.halfDepth, e.z));
  return Math.hypot(e.x - cx, e.z - cz);
}

export function updateEnemies(state, balance) {
  const dt = balance.sim.tickSeconds;
  const ecfg = balance.enemies;
  for (const e of state.enemies) {
    e.prevX = e.x; e.prevZ = e.z; e.prevAngle = e.angle;
    e.moving = false;
    const t = ecfg.types[e.type];
    let tx, tz, stopDist;
    const ally = enemyAllyTarget(state, e, balance);
    if (ally) {
      tx = ally.obj.x; tz = ally.obj.z; stopDist = t.radius + ally.r + t.reach;
    } else {
      const path = state.paths.find(p => p.id === e.pathId);
      while (e.wp < path.points.length) {
        const [px, pz] = path.points[e.wp];
        if (Math.hypot(px - e.x, pz - e.z) > ecfg.waypointReach) break;
        e.wp += 1;
      }
      if (e.wp < path.points.length) { [tx, tz] = path.points[e.wp]; stopDist = 0; }
      else {
        // 길 끝: 성채로. 성채 벽에 닿으면 멈춤
        if (distToCastle(state, e) <= t.radius + t.reach) { tx = state.castle.x; tz = state.castle.z; stopDist = Infinity; }
        else { tx = state.castle.x; tz = state.castle.z; stopDist = 0; }
      }
    }
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) e.angle = Math.atan2(dx, dz);
    if (d > stopDist && d > 1e-6) {
      const stepLen = Math.min(d - (Number.isFinite(stopDist) ? stopDist : 0), t.speed * dt);
      if (stepLen > 0) {
        e.x += dx / d * stepLen; e.z += dz / d * stepLen;
        e.moving = true;
      }
    }
  }
  separateEnemies(state, balance);
  for (const e of state.enemies) {
    const r = ecfg.types[e.type].radius;
    pushOutOfBox(e, r, state.castle);
    for (const b of state.buildings) pushOutOfBox(e, r, b);
  }
}

/** 적끼리 겹치지 않게 살짝 밀어냄 (줄 서서 오는 느낌) */
function separateEnemies(state, balance) {
  const types = balance.enemies.types;
  const k = balance.enemies.separation;
  const list = state.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i], ra = types[a.type].radius;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j], rb = types[b.type].radius;
      const dx = b.x - a.x, dz = b.z - a.z;
      const minD = (ra + rb) * k;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD) continue;
      const d = Math.sqrt(d2);
      // 완전히 겹치면 id 순서로 정해진 방향으로 (결정론)
      const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
      const push = (minD - d) / 2;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
    }
  }
}
