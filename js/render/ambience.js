// 밤 분위기 연출: 해 질 녘·새벽에 서서히 어두워지고 밝아지는 정도, 방폭문이 맞을 때 화면 흔들림.
// 화면 연출만 한다 (sim 상태를 바꾸지 않음). 흔들림은 sin 곡선이라 Math.random을 쓰지 않는다.
import { CONFIG } from '../config.js';
import { getDayElapsedSec, getDay } from '../sim/clock.js';

const A = CONFIG.AMBIENCE;
const T = CONFIG.TIME;

/** 0 = 한낮, 1 = 한밤. 해 질 녘 DUSK_SEC 동안 0→1, 새벽 DAWN_SEC 동안 1→0 (1일차 아침은 밤이 없었으니 바로 밝음) */
export function nightLevel(state) {
  const sec = getDayElapsedSec(state);
  if (sec >= T.DAYLIGHT_SEC) return 1;
  if (sec < A.DAWN_SEC && getDay(state) > 1) return 1 - sec / A.DAWN_SEC;
  const toNight = T.DAYLIGHT_SEC - sec;
  return toNight < A.DUSK_SEC ? 1 - toNight / A.DUSK_SEC : 0;
}

/** 어둠 색 (alpha 0..1) */
export function nightColor(alpha) {
  return `rgba(${A.NIGHT_RGB},${alpha.toFixed(3)})`;
}

/** 지상 화면 밤 어둠 (level 0..1). 가장자리 어둠은 CSS 층(#night-veil)이 맡는다 — 캔버스에 그라데이션을 매 프레임 그리면 느리다 */
export function drawNightVeil(ctx, w, h, level) {
  if (level <= 0) return;
  ctx.fillStyle = nightColor(A.SURFACE_ALPHA * level);
  ctx.fillRect(0, 0, w, h);
}

/** 가장자리 어둠 CSS 층의 진하기 (지상 화면에서만) */
export function veilOpacity(level, view) {
  return view === 'surface' ? Math.round(level * 100) / 100 : 0;
}

/** 화면 흔들림. kick(kind)로 시작, offset(now)로 그 순간의 {x, y} */
export function createShake() {
  const sh = { until: 0, start: 0, amp: 0, ms: 1, reduced: false };
  return {
    kick(kind, now) {
      if (sh.reduced) return;
      const k = kind === 'big' ? A.SHAKE_BIG : A.SHAKE_SMALL;
      if (now < sh.until && sh.amp >= k.amp) return; // 더 센 흔들림이 진행 중
      Object.assign(sh, { start: now, until: now + k.ms, amp: k.amp, ms: k.ms });
    },
    offset(now) {
      if (now >= sh.until) return null;
      const left = (sh.until - now) / sh.ms;         // 1 → 0 으로 잦아든다
      const a = sh.amp * left;
      const p = (now - sh.start) / A.SHAKE_FREQ_MS;
      // 정수 픽셀로: 캐시를 붙일 때 픽셀 경계가 맞아야 빠르다
      const x = Math.round(Math.sin(p * 2.1) * a), y = Math.round(Math.cos(p * 2.9) * a * 0.6);
      return x || y ? { x, y } : null;
    },
    setReduced(v) { sh.reduced = !!v; },
    get active() { return sh.until > 0; },
  };
}

/** 방폭문 체력 칸 (흔들기 판단용) */
export function doorStep(state) {
  const max = CONFIG.BUNKER.DOOR_LEVELS[state.door.level - 1].hp;
  return Math.ceil((Math.max(0, state.door.hp) / max) * A.SHAKE_DOOR_STEPS);
}
