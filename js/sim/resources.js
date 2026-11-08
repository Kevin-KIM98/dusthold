// 자원 더하기·쓰기. 여러 sim 모듈이 같이 쓴다 (순환 import 방지용). DOM 금지.

/** 자원을 더하고(저장 상한 적용) 실제로 들어간 양을 돌려준다. 통신부품은 상한 없음. 넘치는 만큼은 버려진다. */
export function addResource(state, res, n) {
  const r = state.resources;
  const before = r[res] || 0;
  const after = res === 'parts' ? before + n : Math.min(state.storageCap, before + n);
  r[res] = Math.max(before, after);
  return r[res] - before;
}

/** 모자란 양 {wood: 3} — 다 있으면 null */
export function missingCost(state, cost) {
  let miss = null;
  for (const k of Object.keys(cost || {})) {
    const lack = cost[k] - Math.floor(state.resources[k] || 0);
    if (lack > 0) (miss || (miss = {}))[k] = lack;
  }
  return miss;
}

export function canAfford(state, cost) {
  return missingCost(state, cost) === null;
}

/** 비용을 뺀다. 모자라면 아무것도 안 하고 false */
export function spend(state, cost) {
  if (!canAfford(state, cost)) return false;
  for (const k of Object.keys(cost || {})) state.resources[k] -= cost[k];
  return true;
}
