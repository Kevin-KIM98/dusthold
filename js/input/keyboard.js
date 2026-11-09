// PC 키보드(WASD·화살표). 화면 기준 방향 { sx, sy }를 돌려준다 (sy = 위쪽이 +).
const KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export function createKeyboard(target = window) {
  const down = new Set();
  const onDown = e => { if (KEYS[e.code]) { down.add(e.code); e.preventDefault(); } };
  const onUp = e => { down.delete(e.code); };
  const onBlur = () => down.clear();
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  return {
    read() {
      let sx = 0, sy = 0;
      for (const code of down) { sx += KEYS[code][0]; sy += KEYS[code][1]; }
      const m = Math.hypot(sx, sy);
      return m > 0 ? { sx: sx / m, sy: sy / m } : { sx: 0, sy: 0 };
    },
  };
}
