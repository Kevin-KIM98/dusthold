// 전투: 자동 공격 · 피해 · 죽음(은화 떨어뜨림) · 성주 쓰러짐/부활
import { range } from './rng.js';
import { spawnCoin } from './coins.js';
import { enemyTarget, inReach, distToCastle } from './units.js';

const ticks = (s, balance) => Math.round(s / balance.sim.tickSeconds);

/** (x,z)에서 사거리 안 가장 가까운 적 (거리 = 중심 간 거리 − 적 반지름) */
function nearestEnemy(state, x, z, rangeM, balance) {
  let best = null, bestD = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.x - x, e.z - z) - balance.enemies.types[e.type].radius;
    if (d <= rangeM && d < bestD) { best = e; bestD = d; }
  }
  return best;
}

function damageEnemy(state, e, dmg, balance) {
  e.hp -= dmg;
  state.events.push({ type: 'hit', target: 'enemy', id: e.id, x: e.x, z: e.z, dmg });
}

export function updateCombat(state, balance) {
  const c = state.commander;
  const ccfg = balance.commander, acfg = balance.archers;
  updateRespawn(state, balance); // 쓰러진 틱은 세지 않도록 공격보다 먼저

  // 성주 근접 공격
  if (c.alive) {
    if (c.cooldown > 0) c.cooldown -= 1;
    if (c.cooldown <= 0) {
      const e = nearestEnemy(state, c.x, c.z, ccfg.range, balance);
      if (e) {
        damageEnemy(state, e, ccfg.attack, balance);
        state.events.push({ type: 'slash', x: c.x, z: c.z, tx: e.x, tz: e.z });
        c.cooldown = ticks(ccfg.attackInterval, balance);
      }
    }
  }

  // 궁수 사격 (즉시 명중, 화살은 연출)
  for (const a of state.archers) {
    if (a.cooldown > 0) a.cooldown -= 1;
    if (a.cooldown > 0) continue;
    const e = nearestEnemy(state, a.x, a.z, acfg.range, balance);
    if (!e) continue;
    a.angle = Math.atan2(e.x - a.x, e.z - a.z);
    damageEnemy(state, e, acfg.attack, balance);
    state.events.push({ type: 'shot', x: a.x, z: a.z, tx: e.x, tz: e.z });
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
      const e = nearestEnemy(state, b.x, b.z, tcfg.range, balance);
      if (!e) return;
      ta.angle = Math.atan2(e.x - b.x, e.z - b.z);
      damageEnemy(state, e, dmg, balance);
      const o = towerArcherOffset(i, b);
      state.events.push({ type: 'shot', x: b.x + o.x, z: b.z + o.z, tx: e.x, tz: e.z, from: 'tower' });
      ta.cooldown = ticks(tcfg.attackInterval, balance);
    });
  }

  // 적 공격
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const t = balance.enemies.types[e.type];
    if (e.cooldown > 0) e.cooldown -= 1;
    e.attacking = false;
    const target = enemyTarget(state, e, balance);
    let hit = null;
    if (target && inReach(e, target, balance)) hit = target;
    else if (!target && e.wp >= pathLen(state, e) && distToCastle(state, e) <= t.radius + t.reach + 1e-6) hit = { kind: 'castle', obj: state.castle };
    if (!hit) continue;
    e.attacking = true;
    if (e.cooldown > 0) continue;
    e.cooldown = ticks(t.attackInterval, balance);
    if (hit.kind === 'castle') {
      state.castle.hp = Math.max(0, state.castle.hp - t.attack);
      state.events.push({ type: 'hit', target: 'castle', x: e.x, z: e.z, dmg: t.attack });
      continue;
    }
    if (hit.kind === 'wall') {
      hit.obj.hp -= t.attack;
      state.events.push({ type: 'hit', target: 'wall', id: hit.obj.id, x: hit.px, z: hit.pz, dmg: t.attack });
    } else if (!t.splash) {
      if (hit.kind === 'commander') hurtCommander(state, t.attack, balance);
      else hurtArcher(state, hit.obj, t.attack);
    }
    if (t.splash) {
      // 거인: 내려친 자리 주변 splash m 안 아군 모두
      const px = hit.px, pz = hit.pz;
      if (c.alive && Math.hypot(c.x - px, c.z - pz) <= t.splash) hurtCommander(state, t.attack, balance);
      for (const a of state.archers) if (Math.hypot(a.x - px, a.z - pz) <= t.splash) hurtArcher(state, a, t.attack);
      state.events.push({ type: 'smash', x: px, z: pz });
    }
  }

  cleanupDead(state, balance);
}

/** 망루 위 궁수 i번 자리 (망루 중심 기준) */
export function towerArcherOffset(i, b) {
  const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
  const r = b.halfWidth * 0.55;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

function pathLen(state, e) { return state.paths.find(p => p.id === e.pathId).points.length; }

function hurtArcher(state, a, dmg) {
  a.hp -= dmg;
  state.events.push({ type: 'hit', target: 'archer', id: a.id, x: a.x, z: a.z, dmg });
}

function hurtCommander(state, dmg, balance) {
  const c = state.commander;
  c.hp -= dmg;
  state.events.push({ type: 'hit', target: 'commander', x: c.x, z: c.z, dmg });
  if (c.hp > 0) return;
  // 쓰러짐: 들고 있던 은화 절반을 떨어뜨리고 respawnSeconds 뒤 성채 앞에서 부활
  c.hp = 0;
  c.alive = false;
  c.moving = false;
  c.respawn = ticks(balance.commander.respawnSeconds, balance);
  const drop = Math.floor(c.coins * balance.commander.dropFraction);
  c.coins -= drop;
  scatterCoins(state, c.x, c.z, drop, balance.commander.dropSpread, balance);
  state.events.push({ type: 'commanderDown', x: c.x, z: c.z, dropped: drop });
}

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

function scatterCoins(state, x, z, n, spread, balance) {
  for (let i = 0; i < n; i++) {
    const a = range(state.rng, 0, Math.PI * 2);
    const r = spread * Math.sqrt(range(state.rng, 0, 1));
    spawnCoin(state, x + Math.cos(a) * r, z + Math.sin(a) * r, false, balance);
  }
}

function cleanupDead(state, balance) {
  if (state.enemies.some(e => e.hp <= 0)) {
    const alive = [];
    for (const e of state.enemies) {
      if (e.hp > 0) { alive.push(e); continue; }
      const t = balance.enemies.types[e.type];
      scatterCoins(state, e.x, e.z, t.coins, balance.enemies.dropSpread, balance);
      state.kills += 1;
      state.events.push({ type: 'enemyDown', id: e.id, enemy: e.type, x: e.x, z: e.z });
    }
    state.enemies = alive;
  }
  if (state.walls.some(w => w.hp <= 0)) {
    for (const w of state.walls) if (w.hp <= 0) state.events.push({ type: 'wallDown', id: w.id, x: w.x, z: w.z, gate: w.gate });
    state.walls = state.walls.filter(w => w.hp > 0);
  }
  if (state.archers.some(a => a.hp <= 0)) {
    for (const a of state.archers) if (a.hp <= 0) state.events.push({ type: 'archerDown', id: a.id, x: a.x, z: a.z });
    state.archers = state.archers.filter(a => a.hp > 0);
  }
}
