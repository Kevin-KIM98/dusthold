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

/**
 * 건물이 부서짐 (2026-11-10): 그 자리에 패드가 다시 열리고 처음 비용의 절반으로 재건.
 * 같은 종류 건물이 하나도 안 남으면 해금 표시도 꺼서, 그 건물이 필요한 패드(예: 궁수 모집)는 다시 닫힌다.
 */
export function destroyBuilding(state, b, balance) {
  state.buildings = state.buildings.filter(o => o !== b);
  if (!state.buildings.some(o => o.kind === b.kind)) state.unlocked[b.kind] = false;
  const def = balance.pads.list.find(d => d.builds === b.kind && Math.abs(d.x - b.x) < 1e-6 && Math.abs(d.z - b.z) < 1e-6);
  if (def) {
    const pad = state.pads.find(p => p.id === def.id);
    pad.done = false; pad.rebuild = true; pad.paid = 0; pad.payAcc = 0;
    pad.cost = Math.ceil(def.cost * balance.buildings.rebuildCostFactor);
  }
  state.events.push({ type: 'buildingDown', kind: b.kind, id: b.id, x: b.x, z: b.z });
}
