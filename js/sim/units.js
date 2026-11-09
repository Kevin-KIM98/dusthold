// 유닛 이동: 따라다니는 궁수 · 적(길 따라 성채로, 가까운 아군은 공격하러 다가감)
import { resolveCollisions } from './commander.js';
import { pushOutOfBox } from './collision.js';
import { boxDist } from './walls.js';

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

/** 궁수 i번의 대열 자리: 성주가 지나간 길을 따라 뒤로 (slotBack + 줄 × slotRow)m, 줄 안에서 옆으로 벌림 */
export function archerSlot(state, i, balance) {
  const cfg = balance.archers;
  const c = state.commander;
  const row = Math.floor(i / cfg.perRow), col = (i % cfg.perRow) - (cfg.perRow - 1) / 2;
  const back = cfg.slotBack + row * cfg.slotRow, side = col * cfg.slotSide;
  // 길을 따라 back만큼 거슬러 올라간 점과 그 지점의 진행 방향
  let px = c.x, pz = c.z, left = back;
  let dx = -Math.sin(c.angle), dz = -Math.cos(c.angle); // 기본: 성주 등 뒤
  for (const [tx, tz] of c.trail) {
    const sx = tx - px, sz = tz - pz, d = Math.hypot(sx, sz);
    if (d < 1e-6) continue;
    if (d >= left) { px += sx / d * left; pz += sz / d * left; dx = sx / d; dz = sz / d; left = 0; break; }
    px = tx; pz = tz; left -= d; dx = sx / d; dz = sz / d;
  }
  px += dx * left; pz += dz * left; // 길이 짧으면 마지막 방향으로 연장
  // 옆으로 벌리기 (진행 방향의 수직)
  return { x: px - dz * side, z: pz + dx * side };
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

/** 적이 길을 따라 지금 향하는 점 (다음 꺾이는 점, 길 끝이면 성채) */
export function pathGoal(state, e) {
  const path = state.paths.find(p => p.id === e.pathId);
  if (e.wp < path.points.length) return path.points[e.wp];
  return [state.castle.x, state.castle.z];
}

/** 선분 (ax,az)→(bx,bz)가 사각형(반지름 r만큼 키움)을 지나는지 */
function segmentHitsBox(ax, az, bx, bz, box, r) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, box.x - box.halfWidth - r, box.x + box.halfWidth + r], [az, dz, box.z - box.halfDepth - r, box.z + box.halfDepth + r]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * 이 적이 지금 공격하러 갈 대상 (기획서 ③ "가는 길 2m 안 아군·성벽")
 * - 2m 안 가장 가까운 아군(성주·궁수)이 있으면 그쪽, 없으면 길을 따라 감
 * - 가려는 길을 2m 안 성벽이 막고 있으면 그 성벽 (부서진 틈이 있으면 그리로 지나감)
 * - 반환: { kind, obj, d(가장자리까지 거리), px, pz(다가갈 점), r } 또는 null
 */
export function enemyTarget(state, e, balance) {
  const aggro = balance.enemies.aggroRange;
  const er = balance.enemies.types[e.type].radius;
  let ally = null;
  const consider = (cand) => { if (cand.d <= aggro && (!ally || cand.d < ally.d)) ally = cand; };
  const c = state.commander;
  if (c.alive) {
    const r = balance.commander.radius;
    consider({ kind: 'commander', obj: c, d: Math.hypot(c.x - e.x, c.z - e.z) - r, px: c.x, pz: c.z, r });
  }
  const ar = balance.archers.radius;
  for (const a of state.archers) consider({ kind: 'archer', obj: a, d: Math.hypot(a.x - e.x, a.z - e.z) - ar, px: a.x, pz: a.z, r: ar });

  const [gx, gz] = ally ? [ally.px, ally.pz] : pathGoal(state, e);
  let wall = null;
  for (const w of state.walls) {
    const b = boxDist(w, e.x, e.z);
    if (b.d > aggro || (wall && b.d >= wall.d)) continue;
    if (!segmentHitsBox(e.x, e.z, gx, gz, w, er * 0.9)) continue;
    wall = { kind: 'wall', obj: w, d: b.d, px: b.px, pz: b.pz, r: 0 };
  }
  return wall || ally;
}

/** 대상이 손 닿는 거리인지 */
export function inReach(e, target, balance) {
  const t = balance.enemies.types[e.type];
  return target.d <= t.radius + t.reach + 1e-6;
}

/** 적 중심에서 성채 사각형 가장자리까지 거리 */
export function distToCastle(state, e) {
  return boxDist(state.castle, e.x, e.z).d;
}

export function updateEnemies(state, balance) {
  const dt = balance.sim.tickSeconds;
  const ecfg = balance.enemies;
  for (const e of state.enemies) {
    e.prevX = e.x; e.prevZ = e.z; e.prevAngle = e.angle;
    e.moving = false;
    const t = ecfg.types[e.type];
    let tx, tz, stopDist;
    const target = enemyTarget(state, e, balance);
    if (target) {
      // 대상 쪽으로 다가가되, 손이 닿으면 멈춤
      tx = target.px; tz = target.pz;
      stopDist = inReach(e, target, balance) ? Infinity : 0;
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
    for (const w of state.walls) pushOutOfBox(e, r, w); // 적은 성문도 못 지나감
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
