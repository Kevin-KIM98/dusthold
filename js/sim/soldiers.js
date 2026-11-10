// 돌격병 (2026-11-10): 돌격대 막사에서 계속 나와 성문을 지나 길을 따라 적 기지로 행군한다.
// 가는 길의 적과 싸우고, 기지에 닿으면 기지를 공격한다. 적은 아군을 공격하지 않으므로 쓰러지지 않는다.
import { resolveCollisions } from './commander.js';
import { boxDist } from './walls.js';

const ticksOf = (s, balance) => Math.round(s / balance.sim.tickSeconds);

/** 아직 점령 안 된 적 기지 중 (기준점에서) 가장 가까운 것 */
function openCamp(state, x, z) {
  let best = null, bd = Infinity;
  for (const c of state.camps) {
    if (c.captured) continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

/** 길의 성채 쪽 끝에서 출발 (길을 거꾸로 따라 기지로) */
function placeAtStart(state, sd, pathId) {
  const path = state.paths.find(p => p.id === pathId);
  const [x, z] = path.points[path.points.length - 1];
  sd.pathId = pathId; sd.dir = -1; sd.wp = path.points.length - 1; sd.nextPath = null;
  sd.x = sd.prevX = x; sd.z = sd.prevZ = z;
}

export function spawnSoldier(state, balance) {
  // 길을 번갈아 고름 (점령 안 된 기지가 있는 길 우선)
  const open = state.camps.filter(c => !c.captured).map(c => c.pathId);
  const ids = open.length ? open : state.paths.map(p => p.id);
  const pathId = ids[state.soldierTurn++ % ids.length];
  const sd = { id: state.nextId++, x: 0, z: 0, prevX: 0, prevZ: 0, angle: 0, prevAngle: 0, cooldown: 0, moving: false };
  placeAtStart(state, sd, pathId);
  state.soldiers.push(sd);
  state.events.push({ type: 'soldierOut', id: sd.id, x: sd.x, z: sd.z });
}

/** 다음 스테이지: 모두 출발점으로 */
export function resetSoldiers(state) {
  state.soldiers.forEach((sd, i) => placeAtStart(state, sd, state.paths[i % state.paths.length].id));
}

/** 이 돌격병이 싸울 적 (aggro m 안 가장 가까운 적) */
export function soldierEnemy(state, sd, balance) {
  const aggro = balance.soldiers.aggroRange;
  let best = null, bd = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - sd.x, e.z - sd.z) - balance.enemies.types[e.type].radius;
    if (d <= aggro && d < bd) { bd = d; best = e; }
  }
  return best;
}

export function updateSoldiers(state, balance) {
  const cfg = balance.soldiers, dt = balance.sim.tickSeconds;
  // 막사에서 내보내기
  for (const b of state.buildings) {
    if (b.kind !== 'warCamp') continue;
    b.timer += 1;
    if (b.timer >= ticksOf(cfg.spawnSeconds, balance)) {
      b.timer = 0;
      if (state.soldiers.length < cfg.max) spawnSoldier(state, balance);
    }
  }
  for (const sd of state.soldiers) {
    sd.prevX = sd.x; sd.prevZ = sd.z; sd.prevAngle = sd.angle;
    sd.moving = false;
    let tx, tz, stop = 0;
    const e = soldierEnemy(state, sd, balance);
    if (e) {
      tx = e.x; tz = e.z; stop = cfg.radius + balance.enemies.types[e.type].radius + cfg.reach * 0.8;
    } else {
      let camp = state.camps.find(c => c.pathId === sd.pathId);
      if (camp && camp.captured && sd.dir === -1) {
        // 이 길의 기지는 점령됨 → 다른 기지가 있으면 길을 되돌아가 그 길로
        const other = openCamp(state, sd.x, sd.z);
        if (other) { sd.dir = 1; sd.nextPath = other.pathId; sd.wp = Math.max(0, sd.wp); }
      }
      const path = state.paths.find(p => p.id === sd.pathId);
      const pts = path.points;
      if (sd.dir === 1) {
        if (sd.wp < pts.length && Math.hypot(pts[sd.wp][0] - sd.x, pts[sd.wp][1] - sd.z) < cfg.waypointReach) sd.wp += 1;
        if (sd.wp >= pts.length) {
          // 성채 쪽 끝에 왔음 → 다른 길로 갈아타서 (그 길 끝점까지 걸어간 뒤) 다시 기지 쪽으로
          const np = state.paths.find(p => p.id === sd.nextPath);
          sd.pathId = np.id; sd.dir = -1; sd.wp = np.points.length - 1; sd.nextPath = null;
          continue;
        }
        [tx, tz] = pts[sd.wp];
      } else {
        while (sd.wp >= 0 && Math.hypot(pts[sd.wp][0] - sd.x, pts[sd.wp][1] - sd.z) < cfg.waypointReach) sd.wp -= 1;
        camp = state.camps.find(c => c.pathId === sd.pathId);
        if (sd.wp >= 0) { [tx, tz] = pts[sd.wp]; }
        else if (camp && !camp.captured) {
          const p = boxDist(camp, sd.x, sd.z);
          tx = p.px; tz = p.pz; stop = cfg.radius + cfg.reach * 0.8;
        } else continue; // 갈 곳 없음 → 대기
      }
    }
    const dx = tx - sd.x, dz = tz - sd.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) sd.angle = Math.atan2(dx, dz);
    if (d > stop + 1e-6) {
      const stepLen = Math.min(d - stop, cfg.speed * dt);
      sd.x += dx / d * stepLen; sd.z += dz / d * stepLen;
      sd.moving = true;
      resolveCollisions(state, sd, cfg.radius, balance.map.halfSize);
    }
  }
}
