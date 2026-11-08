// 시드 랜덤 (mulberry32). Math.random() 금지 — 연출용 파티클 제외.
// 상태는 32비트 정수 하나라서 저장·복원이 쉽다.

const UINT32 = 0x100000000;

export function createRng(seed) {
  let s = (Number(seed) >>> 0) || 1;
  const rng = {
    /** 0 이상 1 미만 */
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 15), z | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      return ((z ^ (z >>> 14)) >>> 0) / UINT32;
    },
    /** min 이상 max 이하 정수 */
    int(min, max) {
      return min + Math.floor(rng.next() * (max - min + 1));
    },
    pick(arr) {
      return arr[Math.floor(rng.next() * arr.length)];
    },
    /** 새 배열로 섞어서 돌려준다 */
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    getState() {
      return s;
    },
    setState(v) {
      s = (Number(v) >>> 0) || 1;
    },
  };
  return rng;
}

/** 상태에 저장된 RNG를 꺼내 쓰고 다시 넣는다. */
export function withRng(state, fn) {
  const r = createRng(1);
  r.setState(state.rng);
  const out = fn(r);
  state.rng = r.getState();
  return out;
}
