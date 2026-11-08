// 입력: PC 단축키 + 캔버스 포인터(탭·드래그·핀치·휠·길게 누르기).
import { CONFIG } from './config.js';

export function initInput(handlers) {
  const K = CONFIG.INPUT;
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === K.KEY_PAUSE) {
      e.preventDefault();
      handlers.onTogglePause();
    } else if (K.KEY_SPEED[e.key] !== undefined) {
      handlers.onSpeed(K.KEY_SPEED[e.key]);
    } else if (e.key === K.KEY_TOGGLE_VIEW) {
      e.preventDefault();
      handlers.onToggleView();
    } else if (e.key === K.KEY_CLOSE) {
      handlers.onClose();
    } else if (e.key === K.KEY_DEBUG) {
      e.preventDefault();
      handlers.onDebug();
    }
  });
}

/**
 * 캔버스 포인터 입력. 좌표는 캔버스 CSS 픽셀 기준.
 * handlers: onTap(x,y), onPan(dx,dy), onZoom(factor, x, y),
 *           onLongPress(x,y) → true를 돌려주면 끌기 시작: onDragMove(x,y), onDragEnd(x,y), onDragCancel()
 */
export function initCanvasInput(canvas, handlers) {
  const TC = CONFIG.TOUCH;
  const pts = new Map(); // pointerId → {x,y}
  let gesture = null;    // { startX, startY, startT, moved, lastX, lastY, pinchDist, longTimer, longFired }

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const dist = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const mid = () => {
    const [a, b] = [...pts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const clearLong = () => {
    if (gesture && gesture.longTimer) { clearTimeout(gesture.longTimer); gesture.longTimer = null; }
  };

  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1) {
      gesture = { startX: p.x, startY: p.y, startT: performance.now(), moved: false, lastX: p.x, lastY: p.y, pinchDist: 0, longTimer: null, longFired: false };
      gesture.longTimer = setTimeout(() => {
        if (gesture && !gesture.moved && pts.size === 1) {
          gesture.longFired = true;
          if (handlers.onLongPress && handlers.onLongPress(gesture.startX, gesture.startY)) gesture.dragging = true;
        }
      }, TC.LONG_PRESS_MS);
    } else if (pts.size === 2 && gesture) {
      clearLong();
      if (gesture.dragging) { gesture.dragging = false; if (handlers.onDragCancel) handlers.onDragCancel(); }
      gesture.moved = true;
      gesture.pinchDist = dist();
      const m = mid();
      gesture.lastX = m.x;
      gesture.lastY = m.y;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !gesture) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1 && gesture.dragging) {
      handlers.onDragMove(p.x, p.y);
      return;
    }
    if (pts.size === 1) {
      if (!gesture.moved && Math.hypot(p.x - gesture.startX, p.y - gesture.startY) > TC.TAP_MAX_PX) {
        gesture.moved = true;
        clearLong();
      }
      if (gesture.moved) handlers.onPan(p.x - gesture.lastX, p.y - gesture.lastY);
      gesture.lastX = p.x;
      gesture.lastY = p.y;
    } else if (pts.size === 2) {
      const d = dist();
      const m = mid();
      if (gesture.pinchDist > 0) handlers.onZoom(d / gesture.pinchDist, m.x, m.y);
      handlers.onPan(m.x - gesture.lastX, m.y - gesture.lastY);
      gesture.pinchDist = d;
      gesture.lastX = m.x;
      gesture.lastY = m.y;
    }
  });

  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.delete(e.pointerId);
    if (!gesture) return;
    if (pts.size === 0) {
      clearLong();
      if (gesture.dragging) {
        if (e.type === 'pointerup') handlers.onDragEnd(p.x, p.y);
        else if (handlers.onDragCancel) handlers.onDragCancel();
        gesture = null;
        return;
      }
      const quick = performance.now() - gesture.startT <= TC.TAP_MAX_MS;
      if (!gesture.moved && !gesture.longFired && quick && e.type === 'pointerup') handlers.onTap(p.x, p.y);
      gesture = null;
    } else if (pts.size === 1) {
      // 핀치 끝 → 남은 손가락으로 드래그 이어가기
      const [rest] = [...pts.values()];
      gesture.lastX = rest.x;
      gesture.lastY = rest.y;
      gesture.pinchDist = 0;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    const step = CONFIG.CAMERA.WHEEL_STEP;
    handlers.onZoom(e.deltaY < 0 ? 1 + step : 1 / (1 + step), p.x, p.y);
  }, { passive: false });
}
