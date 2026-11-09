// 성주 이동. input = 바닥 평면 기준 방향 { x, z } (길이 0~1, 카메라 변환은 입력 쪽에서 끝낸 값)
// 각도 규칙: angle 0 = +z 방향을 봄, 바라보는 방향 = (sin angle, cos angle)
import { pushOutOfCircle, pushOutOfBox, clampToBounds } from './collision.js';

export function moveCommander(state, input, balance) {
  const c = state.commander;
  const cfg = balance.commander;
  const dt = balance.sim.tickSeconds;
  c.prevX = c.x; c.prevZ = c.z; c.prevAngle = c.angle;
  if (!c.alive) { c.moving = false; return; }

  let ix = input ? input.x : 0, iz = input ? input.z : 0;
  let mag = Math.hypot(ix, iz);
  if (mag < 1e-6) { c.moving = false; return; }
  if (mag > 1) { ix /= mag; iz /= mag; mag = 1; }

  c.moving = true;
  c.x += ix * cfg.speed * dt;
  c.z += iz * cfg.speed * dt;
  c.angle = turnToward(c.angle, Math.atan2(ix, iz), cfg.turnRate * dt);

  resolveCollisions(state, c, cfg.radius, balance.map.halfSize);
  recordTrail(c, balance);
}

/** 성주가 지나간 길 (궁수가 이 길을 따라 걷는다). 최신이 앞 */
export function recordTrail(c, balance) {
  const a = balance.archers;
  const step = a.trailStep;
  const maxLen = Math.ceil((a.slotBack + a.slotRow * Math.ceil(a.maxFollowers / a.perRow) + 2) / step) + 2;
  const last = c.trail[0];
  if (!last || Math.hypot(c.x - last[0], c.z - last[1]) >= step) {
    c.trail.unshift([c.x, c.z]);
    if (c.trail.length > maxLen) c.trail.length = maxLen;
  }
}

/** 나무·바위·성채·건물·맵 경계와 겹치지 않게 밀어낸다 */
export function resolveCollisions(state, body, r, halfSize) {
  for (let pass = 0; pass < 3; pass++) {
    let hit = pushOutOfBox(body, r, state.castle);
    for (const b of state.buildings) hit = pushOutOfBox(body, r, b) || hit;
    for (const w of state.walls) if (!w.gate) hit = pushOutOfBox(body, r, w) || hit; // 아군은 성문 통과
    for (const o of state.obstacles) hit = pushOutOfCircle(body, r, o) || hit;
    clampToBounds(body, r, halfSize);
    if (!hit) break;
  }
}

function turnToward(from, to, maxStep) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}
