// 시드 랜덤 (mulberry32). 상태는 평범한 객체 { s } 하나 — 저장·복제·Unity 번역이 쉽다.
// 게임 규칙에서 랜덤이 필요하면 반드시 이 파일만 쓴다.

export function createRng(seed) {
  return { s: seed >>> 0 };
}

/** 0 이상 1 미만의 실수 */
export function next(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** min 이상 max 미만의 실수 */
export function range(rng, min, max) {
  return min + (max - min) * next(rng);
}

/** min 이상 max 이하의 정수 */
export function int(rng, min, max) {
  return min + Math.floor(next(rng) * (max - min + 1));
}
