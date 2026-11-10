// 테스트용 자동 플레이어 (게임 코드 아님). 사람처럼 단순하게:
// 은화 줍기 → 세금 걷기 → 살 수 있는 패드 사기(정해진 순서) → 없으면 적이 오는 성문 안쪽에서 방어
import { step } from '../js/sim/rules.js';

const ORDER = ['barracks', 'recruit', 'taxTable', 'walls', 'tower1', 'tower3', 'tower2', 'tower4', 'stoneWalls', 'towerUpgrade'];

/** 성채를 가로지르면 가장 가까운 모서리로 돌아간다 */
function aroundCastle(s, B, x, z) {
  const c = s.commander, k = s.castle, m = B.commander.radius + 0.9;
  const box = { x: k.x, z: k.z, hw: k.halfWidth + m, hd: k.halfDepth + m };
  const crosses = (ax, az, bx, bz) => {
    for (let i = 1; i < 20; i++) {
      const t = i / 20, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      if (Math.abs(px - box.x) < box.hw && Math.abs(pz - box.z) < box.hd) return true;
    }
    return false;
  };
  // 목표가 성채 바로 옆(여유 안)이면 여유 바깥 가장 가까운 점으로 (줍기 반경이 넉넉해서 거기서도 주워짐)
  if (Math.abs(x - box.x) < box.hw && Math.abs(z - box.z) < box.hd) {
    const ex = box.hw - Math.abs(x - box.x), ez = box.hd - Math.abs(z - box.z);
    if (ex < ez) x = box.x + Math.sign(x - box.x || 1) * (box.hw + 0.05);
    else z = box.z + Math.sign(z - box.z || 1) * (box.hd + 0.05);
  }
  if (!crosses(c.x, c.z, x, z)) return [x, z];
  // 성채 네 모서리를 거쳐 가는 가장 짧은 길 (매 틱 같은 답이 나와야 왔다 갔다 하지 않음)
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([sx, sz]) => [box.x + sx * (box.hw + 0.3), box.z + sz * (box.hd + 0.3)]);
  const nodes = [[c.x, c.z], ...corners, [x, z]];
  const n = nodes.length, dist = Array(n).fill(Infinity), prev = Array(n).fill(-1), done = Array(n).fill(false);
  dist[0] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      const [ax, az] = nodes[u], [bx, bz] = nodes[v];
      if (crosses(ax, az, bx, bz)) continue;
      const nd = dist[u] + Math.hypot(bx - ax, bz - az);
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
    }
  }
  if (prev[n - 1] < 0) return corners[0];
  const route = [];
  for (let v = n - 1; v > 0; v = prev[v]) route.unshift(v);
  // 이미 서 있는 모서리는 건너뛰고 그다음 지점으로
  for (const v of route) if (Math.hypot(nodes[v][0] - c.x, nodes[v][1] - c.z) > 0.4) return nodes[v];
  return [x, z];
}

function steer(s, B, x, z) {
  [x, z] = aroundCastle(s, B, x, z);
  const c = s.commander;
  const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
  if (d < 0.15) return { x: 0, z: 0 };
  const k = Math.min(1, d / (B.commander.speed * B.sim.tickSeconds));
  return { x: dx / d * k, z: dz / d * k };
}

/** 성벽 안쪽 ↔ 바깥으로 갈 때 성문을 거치도록 경유점 (성문 앞에 줄 맞춘 뒤 통과) */
function viaGate(s, B, x, z) {
  const c = s.commander, W = B.walls.half;
  if (!s.walls.length) return [x, z];
  const inside = (px, pz) => Math.max(Math.abs(px - s.castle.x), Math.abs(pz - s.castle.z)) < W;
  if (inside(c.x, c.z) === inside(x, z)) return [x, z];
  const gates = s.walls.filter(w => w.gate);
  if (!gates.length) return [x, z]; // 성문이 부서졌으면 그 틈으로 (직진)
  let g = gates[0], best = Infinity;
  for (const w of gates) { const d = Math.hypot(w.x - x, w.z - z) + Math.hypot(w.x - c.x, w.z - c.z); if (d < best) { best = d; g = w; } }
  // 성문의 바깥 방향 n, 문 따라 방향 t
  const alongX = g.halfWidth > g.halfDepth;
  const nx = alongX ? 0 : Math.sign(g.x - s.castle.x), nz = alongX ? Math.sign(g.z - s.castle.z) : 0;
  const tx = alongX ? 1 : 0, tz = alongX ? 0 : 1;
  const half = Math.max(g.halfWidth, g.halfDepth) - B.commander.radius - 0.1;
  const dir = inside(c.x, c.z) ? 1 : -1;                 // 1 = 나가는 중
  const sAlong = (c.x - g.x) * nx + (c.z - g.z) * nz;     // 문 기준 앞뒤 거리 (+ = 바깥)
  const lateral = (c.x - g.x) * tx + (c.z - g.z) * tz;
  const lined = Math.abs(lateral) < half && sAlong * dir > -2.2; // 문 앞에 줄 맞춰 섰음
  if (lined) return [g.x + nx * 2.2 * dir + tx * lateral * 0.5, g.z + nz * 2.2 * dir + tz * lateral * 0.5];
  return [g.x - nx * 1.6 * dir, g.z - nz * 1.6 * dir];   // 먼저 문 앞(이쪽 편)으로
}

export function botInput(s, B) {
  const c = s.commander;
  if (!c.alive) return { x: 0, z: 0 };
  const W = B.walls.half;
  const go = (x, z) => { const [tx, tz] = viaGate(s, B, x, z); return steer(s, B, tx, tz); };
  const tSec = (s.tick - s.spawn.startTick) * B.sim.tickSeconds;
  // 1) 부서져서 다시 열린 패드(재건) 먼저
  for (const p of s.pads) if (p.open && p.rebuild && c.coins >= Math.min(p.cost - p.paid, 10)) return go(p.x, p.z);
  // 2) 가까운 바닥 은화 (적은 아군을 안 때리니 성벽 밖도 OK)
  if (c.coins < B.coins.carryMax && s.coins.length) {
    let best = null, bd = Infinity;
    for (const k of s.coins) { const d = Math.hypot(k.x - c.x, k.z - c.z); if (d < bd) { bd = d; best = k; } }
    if (best && bd < 9) return go(best.x, best.z);
  }
  // 3) 세금 탁자
  const table = s.buildings.find(b => b.kind === 'taxTable');
  if (table && table.stored >= 8 && c.coins < B.coins.carryMax) return go(table.x, table.z + table.halfDepth + 0.9);
  // 4) 살 수 있는 패드 (정해진 순서)
  for (const id of ORDER) {
    const p = s.pads.find(q => q.id === id);
    if (!p || !p.open) continue;
    if (c.coins >= Math.min(p.cost - p.paid, 10) || (p.payAcc > 0 && c.coins > 0)) return go(p.x, p.z);
    break;
  }
  // 4.5) (살 게 없으면) 성벽 안(또는 성채 근처)에 들어온 적이 있으면 먼저 잡으러
  let inside = null, idist = Infinity;
  for (const e of s.enemies) {
    if (Math.max(Math.abs(e.x - s.castle.x), Math.abs(e.z - s.castle.z)) >= W - 0.5) continue;
    const d = Math.hypot(e.x - c.x, e.z - c.z);
    if (d < idist) { idist = d; inside = e; }
  }
  if (inside) return idist < 1.5 ? { x: 0, z: 0 } : go(inside.x, inside.z);
  // 5) 점령하러: 궁수 3명 이상이고 성벽이 있거나, 2분이 지나면 → 가장 가까운 적 기지로 좁은 길을 따라
  const ready = s.archers.length >= 3 && (s.walls.length > 0 || tSec > 120);
  const camps = s.camps.filter(k => !k.captured);
  if (ready && camps.length) {
    let camp = camps[0], cd = Infinity;
    for (const k of camps) { const d = Math.hypot(k.x - c.x, k.z - c.z); if (d < cd) { cd = d; camp = k; } }
    const path = s.paths.find(p => p.id === camp.pathId);
    const pts = path.points;
    // 길에서 멀면(성벽 안 등) 길 끝(성채 쪽)으로 먼저
    let seg = 0, sd = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
      const t = Math.max(0, Math.min(len, ((c.x - ax) * dx + (c.z - az) * dz) / len));
      const d = Math.hypot(c.x - (ax + dx / len * t), c.z - (az + dz / len * t));
      if (d < sd) { sd = d; seg = i; }
    }
    if (sd > 3) { const e = pts[pts.length - 1]; return go(e[0] + (pts[pts.length - 2][0] - e[0]) * 0.0, e[1]); }
    // 기지 앞에 도착했으면 거기서 공격 (성주가 자동으로 침)
    if (Math.hypot(camp.sx - c.x, camp.sz - c.z) < 4 || seg === 0) return go(camp.sx, camp.sz);
    // 길을 거슬러 올라가기: 지금 선분의 시작점(기지 쪽)으로, 가까우면 그 전 점으로
    let k = seg;
    if (Math.hypot(pts[k][0] - c.x, pts[k][1] - c.z) < 1.2) k = Math.max(0, k - 1);
    return go(pts[k][0], pts[k][1]);
  }
  // 6) 방어: 적이 가장 많이 몰린 길의 성문 안쪽
  let target = null, td = Infinity;
  for (const e of s.enemies) { const d = Math.hypot(e.x, e.z); if (d < td) { td = d; target = e; } }
  const pathId = target ? target.pathId : 'south';
  const path = s.paths.find(p => p.id === pathId);
  const end = path.points[path.points.length - 1];
  const dir = [Math.sign(end[0]) * (Math.abs(end[0]) > Math.abs(end[1]) ? 1 : 0), Math.sign(end[1]) * (Math.abs(end[1]) >= Math.abs(end[0]) ? 1 : 0)];
  const hold = s.walls.length ? W - 2.5 : 8;
  return go(dir[0] * hold + (dir[1] ? -0.8 : 0), dir[1] * hold + (dir[0] ? 0.8 : 0));
}

/** 한 판을 끝까지 (또는 maxSeconds까지) 자동으로 */
export function playGame(createState, B, seed, maxSeconds = 600) {
  const s = createState(B, seed);
  const TPS = Math.round(1 / B.sim.tickSeconds);
  for (let i = 0; i < maxSeconds * TPS && !s.result; i++) step(s, botInput(s, B), B);
  return s;
}
