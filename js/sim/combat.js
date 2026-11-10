// 전투 (기획서 ③ 2026-11-10 개편)
// - 성주: 빛나는 칼로 범위 베기(가까우면) / 손도끼 던지기(멀면). 적이 없으면 적 기지를 공격
// - 궁수·망루: 가장 가까운 적, 없으면 사거리 안 적 기지
// - 적: 메인 성채만 공격 (길을 막는 성벽은 부수고 지나감). 아군·다른 건물은 공격하지 않음
import { range } from './rng.js';
import { spawnCoin } from './coins.js';
import { enemyTarget, inReach, distToCastle } from './units.js';
import { boxDist } from './walls.js';
import { captureCamp } from './camps.js';

const ticks = (s, balance) => Math.round(s / balance.sim.tickSeconds);
const enemyR = (e, balance) => balance.enemies.types[e.type].radius;

/** (x,z)에서 사거리 안 가장 가까운 적 (거리 = 중심 간 거리 − 적 반지름) */
function nearestEnemy(state, x, z, rangeM, balance) {
  let best = null, bestD = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.x - x, e.z - z) - enemyR(e, balance);
    if (d <= rangeM && d < bestD) { best = e; bestD = d; }
  }
  return best;
}

/** 사거리 안(가장자리까지) 아직 점령 안 된 적 기지 */
function campInRange(state, x, z, rangeM) {
  let best = null, bestD = Infinity;
  for (const c of state.camps) {
    if (c.captured) continue;
    const d = boxDist(c, x, z).d;
    if (d <= rangeM && d < bestD) { best = c; bestD = d; }
  }
  return best;
}

function damageEnemy(state, e, dmg, balance, by = '') {
  e.hp -= dmg;
  state.events.push({ type: 'hit', target: 'enemy', id: e.id, x: e.x, z: e.z, dmg, by });
}

function damageCamp(state, camp, dmg, x, z, by = '') {
  camp.hp -= dmg;
  const p = boxDist(camp, x, z);
  state.events.push({ type: 'hit', target: 'camp', id: camp.id, x: p.px, z: p.pz, dmg, by });
}

/** 공격 대상 하나: 적 우선, 없으면 적 기지. { kind, obj, x, z } */
function pickTarget(state, x, z, rangeM, balance) {
  const e = nearestEnemy(state, x, z, rangeM, balance);
  if (e) return { kind: 'enemy', obj: e, x: e.x, z: e.z };
  const c = campInRange(state, x, z, rangeM);
  if (c) { const p = boxDist(c, x, z); return { kind: 'camp', obj: c, x: p.px, z: p.pz }; }
  return null;
}

function strike(state, t, dmg, fromX, fromZ, balance, by) {
  if (t.kind === 'enemy') damageEnemy(state, t.obj, dmg, balance, by);
  else damageCamp(state, t.obj, dmg, fromX, fromZ, by);
}

export function updateCombat(state, balance) {
  const c = state.commander;
  const ccfg = balance.commander, acfg = balance.archers;
  updateRespawn(state, balance);

  // 성주: 칼 사거리 안 적이 있으면 범위 베기(최대 cleaveMax명), 아니면 손도끼, 적이 없으면 기지
  if (c.alive) {
    if (c.cooldown > 0) c.cooldown -= 1;
    if (c.cooldown <= 0) {
      const near = [];
      for (const e of state.enemies) {
        if (e.hp <= 0) continue;
        const d = Math.hypot(e.x - c.x, e.z - c.z) - enemyR(e, balance);
        if (d <= ccfg.range) near.push([d, e]);
      }
      if (near.length) {
        near.sort((a, b) => a[0] - b[0] || a[1].id - b[1].id);
        const hits = near.slice(0, ccfg.cleaveMax).map(p => p[1]);
        for (const e of hits) damageEnemy(state, e, ccfg.attack, balance, 'commander');
        state.events.push({ type: 'slash', x: c.x, z: c.z, tx: hits[0].x, tz: hits[0].z, n: hits.length });
        c.cooldown = ticks(ccfg.attackInterval, balance);
      } else {
        const camp = campInRange(state, c.x, c.z, ccfg.range);
        if (camp) {
          damageCamp(state, camp, ccfg.attack, c.x, c.z, 'commander');
          const p = boxDist(camp, c.x, c.z);
          state.events.push({ type: 'slash', x: c.x, z: c.z, tx: p.px, tz: p.pz, n: 1 });
          c.cooldown = ticks(ccfg.attackInterval, balance);
        } else {
          const t = pickTarget(state, c.x, c.z, ccfg.rangedRange, balance);
          if (t) {
            strike(state, t, ccfg.rangedAttack, c.x, c.z, balance, 'commander');
            state.events.push({ type: 'throw', x: c.x, z: c.z, tx: t.x, tz: t.z });
            c.cooldown = ticks(ccfg.rangedInterval, balance);
          }
        }
      }
    }
  }

  // 궁수 사격 (즉시 명중, 화살은 연출)
  for (const a of state.archers) {
    if (a.cooldown > 0) a.cooldown -= 1;
    if (a.cooldown > 0) continue;
    const t = pickTarget(state, a.x, a.z, acfg.range, balance);
    if (!t) continue;
    a.angle = Math.atan2(t.x - a.x, t.z - a.z);
    strike(state, t, acfg.attack, a.x, a.z, balance);
    state.events.push({ type: 'shot', x: a.x, z: a.z, tx: t.x, tz: t.z });
    a.cooldown = ticks(acfg.attackInterval, balance);
  }

  // 망루 궁수 (망루마다 4명, 고정 사격, 무적)
  const tcfg = balance.towers;
  for (const b of state.buildings) {
    if (b.kind !== 'tower') continue;
    const dmg = tcfg.attack * (b.upgraded ? tcfg.upgradeMultiplier : 1);
    b.towerArchers.forEach((ta, i) => {
      if (ta.cooldown > 0) ta.cooldown -= 1;
      if (ta.cooldown > 0) return;
      const t = pickTarget(state, b.x, b.z, tcfg.range, balance);
      if (!t) return;
      ta.angle = Math.atan2(t.x - b.x, t.z - b.z);
      strike(state, t, dmg, b.x, b.z, balance);
      const o = towerArcherOffset(i, b);
      state.events.push({ type: 'shot', x: b.x + o.x, z: b.z + o.z, tx: t.x, tz: t.z, from: 'tower' });
      ta.cooldown = ticks(tcfg.attackInterval, balance);
    });
  }

  // 적 공격: 길을 막는 성벽, 길 끝에선 성채
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const t = balance.enemies.types[e.type];
    if (e.cooldown > 0) e.cooldown -= 1;
    e.attacking = false;
    const target = enemyTarget(state, e, balance);
    let hit = null;
    if (target && inReach(e, target, balance)) hit = target;
    else if (!target && e.wp >= pathLen(state, e) && distToCastle(state, e) <= t.radius + t.reach + 1e-6) {
      const p = boxDist(state.castle, e.x, e.z);
      hit = { kind: 'castle', obj: state.castle, px: p.px, pz: p.pz };
    }
    if (!hit) continue;
    e.attacking = true;
    if (e.cooldown > 0) continue;
    e.cooldown = ticks(t.attackInterval, balance);
    const dmg = Math.round(t.attack * (e.atk || 1));
    hurtStructure(state, hit.kind, hit.obj, dmg, hit.px, hit.pz);
    if (t.splash) {
      // 거인: 내려친 자리 주변 splash m 안 다른 성벽 구간도 (건물은 성채만 공격하므로 성벽만)
      for (const w of state.walls) if (w !== hit.obj && boxDist(w, hit.px, hit.pz).d <= t.splash) hurtStructure(state, 'wall', w, dmg, hit.px, hit.pz);
      state.events.push({ type: 'smash', x: hit.px, z: hit.pz });
    }
  }

  cleanupDead(state, balance);
}

function hurtStructure(state, kind, obj, dmg, x, z) {
  if (kind === 'castle') {
    state.castle.hp = Math.max(0, state.castle.hp - dmg);
    state.events.push({ type: 'hit', target: 'castle', x, z, dmg });
  } else {
    obj.hp -= dmg;
    state.events.push({ type: 'hit', target: kind, id: obj.id, x, z, dmg });
  }
}

/** 망루 위 궁수 i번 자리 (망루 중심 기준) */
export function towerArcherOffset(i, b) {
  const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
  const r = b.halfWidth * 0.55;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

function pathLen(state, e) { return state.paths.find(p => p.id === e.pathId).points.length; }

// 적이 아군을 공격하지 않으므로 성주는 쓰러지지 않는다. (예전 저장에서 쓰러진 상태로 불러온 경우만 대비)
function updateRespawn(state, balance) {
  const c = state.commander;
  if (c.alive) return;
  c.respawn -= 1;
  if (c.respawn > 0) return;
  const s = balance.map.commanderStart;
  c.alive = true;
  c.hp = balance.commander.hp;
  c.x = c.prevX = s.x; c.z = c.prevZ = s.z; c.angle = c.prevAngle = s.angle;
  c.trail = [[s.x, s.z]];
  state.events.push({ type: 'commanderRespawn', x: s.x, z: s.z });
}

export function scatterCoins(state, x, z, n, spread, balance) {
  for (let i = 0; i < n; i++) {
    const a = range(state.rng, 0, Math.PI * 2);
    const r = spread * Math.sqrt(range(state.rng, 0, 1));
    spawnCoin(state, x + Math.cos(a) * r, z + Math.sin(a) * r, false, balance);
  }
}

/** 쓰러진 적 → 은화 */
export function dropEnemyCoins(state, e, balance) {
  scatterCoins(state, e.x, e.z, balance.enemies.types[e.type].coins, balance.enemies.dropSpread, balance);
  state.kills += 1;
  state.events.push({ type: 'enemyDown', id: e.id, enemy: e.type, x: e.x, z: e.z });
}

function cleanupDead(state, balance) {
  if (state.enemies.some(e => e.hp <= 0)) {
    const alive = [];
    for (const e of state.enemies) {
      if (e.hp > 0) alive.push(e);
      else dropEnemyCoins(state, e, balance);
    }
    state.enemies = alive;
  }
  for (const camp of state.camps) if (!camp.captured && camp.hp <= 0) captureCamp(state, camp, balance);
  if (state.walls.some(w => w.hp <= 0)) {
    for (const w of state.walls) if (w.hp <= 0) state.events.push({ type: 'wallDown', id: w.id, x: w.x, z: w.z, gate: w.gate });
    state.walls = state.walls.filter(w => w.hp > 0);
    // 성벽 패드가 다시 열려 절반 비용으로 모든 구간 재건
    const wp = state.pads.find(p => p.id === 'walls');
    const def = balance.pads.list.find(d => d.id === 'walls');
    if (wp && wp.done && state.wallLevel > 0) {
      wp.done = false; wp.rebuild = true; wp.paid = 0;
      wp.cost = Math.ceil(def.cost * balance.buildings.rebuildCostFactor);
    }
  }
}
