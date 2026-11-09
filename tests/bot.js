// 테스트용 자동 플레이어 (게임 코드 아님). 사람처럼 단순하게:
// 은화 줍기 → 세금 걷기 → 살 수 있는 패드 사기(정해진 순서) → 없으면 적이 오는 성문 안쪽에서 방어
import { step } from '../js/sim/rules.js';

const ORDER = ['barracks', 'recruit', 'taxTable', 'walls', 'tower1', 'tower3', 'tower2', 'tower4', 'stoneWalls', 'towerUpgrade'];

function steer(s, B, x, z) {
  const c = s.commander;
  const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
  if (d < 0.15) return { x: 0, z: 0 };
  const k = Math.min(1, d / (B.commander.speed * B.sim.tickSeconds));
  return { x: dx / d * k, z: dz / d * k };
}

/** 성벽 안쪽에서 바깥으로 갈 때 성문을 거치도록 경유점 */
function viaGate(s, B, x, z) {
  const c = s.commander, W = B.walls.half;
  if (!s.walls.length) return [x, z];
  const inside = p => Math.max(Math.abs(p[0]), Math.abs(p[1])) < W;
  if (inside([c.x, c.z]) === inside([x, z])) return [x, z];
  const gates = s.walls.filter(w => w.gate);
  if (!gates.length) return [x, z];
  let g = gates[0], best = Infinity;
  for (const w of gates) { const d = Math.hypot(w.x - x, w.z - z) + Math.hypot(w.x - c.x, w.z - c.z); if (d < best) { best = d; g = w; } }
  // 성문 중심 근처에 먼저 붙고 통과
  const nx = g.halfWidth < g.halfDepth ? Math.sign(g.x) : 0, nz = g.halfWidth < g.halfDepth ? 0 : Math.sign(g.z);
  const side = inside([c.x, c.z]) ? -1 : 1;
  const ax = g.x + nx * 1.5 * side, az = g.z + nz * 1.5 * side;
  if (Math.hypot(c.x - ax, c.z - az) > 0.6 && Math.hypot(c.x - g.x, c.z - g.z) > 0.8) return [ax, az];
  return [g.x - nx * 1.5 * side, g.z - nz * 1.5 * side];
}

export function botInput(s, B) {
  const c = s.commander;
  if (!c.alive) return { x: 0, z: 0 };
  const W = B.walls.half;
  const go = (x, z) => { const [tx, tz] = viaGate(s, B, x, z); return steer(s, B, tx, tz); };
  const enemiesNear = s.enemies.filter(e => Math.max(Math.abs(e.x), Math.abs(e.z)) < W + 6);
  // 1) 가까운 바닥 은화 (성벽 밖이면 적이 없을 때만, 너무 멀면 무시)
  if (c.coins < B.coins.carryMax && s.coins.length) {
    let best = null, bd = Infinity;
    for (const k of s.coins) {
      const out = Math.max(Math.abs(k.x), Math.abs(k.z)) > W;
      if (out && s.enemies.some(e => Math.hypot(e.x - k.x, e.z - k.z) < 4)) continue;
      const d = Math.hypot(k.x - c.x, k.z - c.z);
      if (d < bd && d < 18) { bd = d; best = k; }
    }
    if (best && (bd < 6 || !enemiesNear.length)) return go(best.x, best.z);
  }
  // 2) 세금 탁자
  const table = s.buildings.find(b => b.kind === 'taxTable');
  if (table && table.stored >= 8 && c.coins < B.coins.carryMax) return go(table.x, table.z + table.halfDepth + 0.9);
  // 3) 살 수 있는 패드
  for (const id of ORDER) {
    const p = s.pads.find(q => q.id === id);
    if (!p || !p.open) continue;
    const left = p.cost - p.paid;
    if (c.coins >= Math.min(left, 10) || (p.payAcc > 0 && c.coins > 0)) return go(p.x, p.z);
    break; // 순서대로만 산다 (돈 모으기)
  }
  // 4) 방어: 가장 가까운 적이 오는 길의 성문 안쪽 (성벽 없으면 길 끝 앞)
  let target = null, td = Infinity;
  for (const e of s.enemies) { const d = Math.hypot(e.x, e.z); if (d < td) { td = d; target = e; } }
  const pathId = target ? target.pathId : 'south';
  const path = s.paths.find(p => p.id === pathId);
  const end = path.points[path.points.length - 1];
  const dir = [Math.sign(end[0]) * (Math.abs(end[0]) > Math.abs(end[1]) ? 1 : 0), Math.sign(end[1]) * (Math.abs(end[1]) >= Math.abs(end[0]) ? 1 : 0)];
  const hold = s.walls.length ? W - 2.5 : 8;
  return go(end[0] * 0 + dir[0] * hold + (dir[1] ? -0.8 : 0), dir[1] * hold + (dir[0] ? 0.8 : 0));
}

/** 한 판을 끝까지 (또는 maxSeconds까지) 자동으로 */
export function playGame(createState, B, seed, maxSeconds = 600) {
  const s = createState(B, seed);
  const TPS = Math.round(1 / B.sim.tickSeconds);
  for (let i = 0; i < maxSeconds * TPS && !s.result; i++) step(s, botInput(s, B), B);
  return s;
}
