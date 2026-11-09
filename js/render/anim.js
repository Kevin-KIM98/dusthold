// 연출용 순수 계산 (Three.js 없음 → Node 테스트 가능)

// 칼 각도 (라디안): 평소 · 휘두르기 시작(뒤로 치켜듦) · 끝(앞으로 내려침)
export const SWORD_IDLE = 0.35, SWORD_RAISE = -1.6, SWORD_STRIKE = 1.5;

/** su = 공격 시작 후 경과 / 휘두르기 시간. 0~0.3 치켜들기, 0.3~0.7 내려치기, 0.7~1.6 제자리로 */
export function swordAngle(su) {
  if (su < 0 || su >= 1.6) return SWORD_IDLE;
  if (su < 0.3) return SWORD_IDLE + (SWORD_RAISE - SWORD_IDLE) * (su / 0.3);
  if (su < 0.7) return SWORD_RAISE + (SWORD_STRIKE - SWORD_RAISE) * ((su - 0.3) / 0.4);
  return SWORD_STRIKE + (SWORD_IDLE - SWORD_STRIKE) * Math.min(1, (su - 0.7) / 0.9);
}
