// 터치·마우스 가상 조이스틱. 화면 아무 곳이나 누르면 그 자리에 생기고, 떼면 사라진다.
// 화면 기준 방향 { sx, sy } (길이 0~1, sy = 위쪽이 +)를 돌려준다.
export function createJoystick(surface, layer, cfg) {
  const base = document.createElement('div');
  base.className = 'joy-base';
  const knob = document.createElement('div');
  knob.className = 'joy-knob';
  base.style.width = base.style.height = `${cfg.radiusPx * 2}px`;
  knob.style.width = knob.style.height = `${cfg.knobPx}px`;
  base.appendChild(knob);
  layer.appendChild(base);

  let pointerId = null, ox = 0, oy = 0, vx = 0, vy = 0;

  function place(dx, dy) {
    const m = Math.hypot(dx, dy);
    const k = m > cfg.radiusPx ? cfg.radiusPx / m : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    vx = dx / cfg.radiusPx;
    vy = -dy / cfg.radiusPx;
  }

  surface.addEventListener('pointerdown', e => {
    if (pointerId !== null) return;
    if (e.target.closest && e.target.closest('.ui')) return;
    pointerId = e.pointerId;
    ox = e.clientX; oy = e.clientY;
    base.style.left = `${ox}px`;
    base.style.top = `${oy}px`;
    base.classList.add('on');
    place(0, 0);
    try { surface.setPointerCapture(e.pointerId); } catch { /* 일부 환경 미지원 */ }
    e.preventDefault();
  });
  surface.addEventListener('pointermove', e => {
    if (e.pointerId !== pointerId) return;
    place(e.clientX - ox, e.clientY - oy);
    e.preventDefault();
  });
  const end = e => {
    if (e.pointerId !== pointerId) return;
    pointerId = null; vx = vy = 0;
    base.classList.remove('on');
  };
  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', end);

  return {
    active: () => pointerId !== null,
    read: () => ({ sx: vx, sy: vy }),
  };
}
