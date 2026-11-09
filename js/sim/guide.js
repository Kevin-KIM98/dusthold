// 다음 해금 위치 안내 (튜토리얼 구간): 지금 어디로 가면 되는지 바닥 좌표를 돌려준다.
// 게임 규칙에는 영향 없음 — 화면 안내용으로 상태를 읽기만 한다.

/** { x, z, kind: 'pad' | 'coin' | 'tax', id } 또는 null(안내 끝) */
export function guideTarget(state, balance) {
  if (state.result || !state.commander.alive) return null;
  const c = state.commander;
  let pad = null;
  for (const id of balance.guide.order) {
    const p = state.pads.find(q => q.id === id);
    if (!p || p.done || p.uses > 0) continue; // 이미 한 단계
    pad = p;
    break;
  }
  if (!pad || !pad.open) return null;
  const need = pad.cost - pad.paid;
  if (c.coins >= need || pad.payAcc > 0) return { x: pad.x, z: pad.z, kind: 'pad', id: pad.id };
  // 은화가 모자라면: 가까운 바닥 은화 → 세금 탁자(쌓여 있으면) → 그래도 패드
  let best = null, bd = Infinity;
  for (const k of state.coins) {
    const d = Math.hypot(k.x - c.x, k.z - c.z);
    if (d < bd) { bd = d; best = k; }
  }
  if (best && bd < balance.walls.half * 2) return { x: best.x, z: best.z, kind: 'coin' };
  const table = state.buildings.find(b => b.kind === 'taxTable');
  if (table && table.stored > 0) return { x: table.x, z: table.z + table.halfDepth + 0.8, kind: 'tax' };
  return { x: pad.x, z: pad.z, kind: 'pad', id: pad.id };
}
