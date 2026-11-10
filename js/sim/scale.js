// 스테이지 배율 (s = 1부터). 순환 import를 피하려고 따로 둔다.
export function stageScale(stage, balance) {
  const g = balance.stages, k = Math.max(0, (stage || 1) - 1);
  return { hp: 1 + g.hpGrowth * k, attack: 1 + g.attackGrowth * k, spawn: 1 + g.spawnGrowth * k };
}
