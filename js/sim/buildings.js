// 건물: 해금되면 생기는 막사·세금 탁자 등. 바닥에서 차지하는 사각형은 이동을 막는다.

export function addBuilding(state, kind, x, z, balance) {
  const cfg = balance.buildings[kind];
  const b = {
    id: state.nextId++, kind, x, z,
    halfWidth: cfg.halfWidth, halfDepth: cfg.halfDepth,
    hp: cfg.hp ?? 0, maxHp: cfg.hp ?? 0,
    stored: 0, timer: 0,
  };
  if (kind === 'tower') {
    b.upgraded = false;
    b.towerArchers = Array.from({ length: balance.towers.archers }, () => ({ cooldown: 0, angle: 0 }));
  }
  state.buildings.push(b);
  return b;
}

/** 세금 탁자: intervalSeconds마다 1개씩 쌓이고(최대 max), 성주가 가까이 오면 전부 가져감 */
export function updateBuildings(state, balance) {
  const c = state.commander;
  const carryMax = balance.coins.carryMax;
  for (const b of state.buildings) {
    if (b.kind !== 'taxTable') continue;
    const cfg = balance.buildings.taxTable;
    const interval = Math.round(cfg.intervalSeconds / balance.sim.tickSeconds);
    if (b.stored < cfg.max) {
      b.timer += 1;
      if (b.timer >= interval) { b.timer = 0; b.stored += 1; }
    } else {
      b.timer = 0;
    }
    if (c.alive && b.stored > 0 && Math.hypot(c.x - b.x, c.z - b.z) <= cfg.collectRadius) {
      const k = Math.min(b.stored, carryMax - c.coins);
      if (k > 0) {
        b.stored -= k;
        c.coins += k;
        state.events.push({ type: 'taxCollect', n: k, x: b.x, z: b.z });
      }
    }
  }
}
