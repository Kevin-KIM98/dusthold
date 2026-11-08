// 성능 측정용 최악 장면 (plan.md ⑥ 성능, CLAUDE.md F9). DOM 금지.
// 지상 11×11 전부 밝힘 + 벙커 40칸(샤프트 8 + 방 32) + 좀비 40마리. 파티클 150개는 화면 쪽에서 채운다.
import { CONFIG } from '../config.js';
import { createState } from './state.js';
import { debugPlaceRoom } from './bunker.js';
import { onNightStart } from './raid.js';
import { tick, DAY_TICKS, DAYLIGHT_TICKS } from './time.js';

const W = CONFIG.WORST;
const B = CONFIG.BUNKER;

export function createWorstState() {
  const s = createState(W.SEED);
  s.tutorial.skipped = true; // 성능 측정엔 가이드 없음
  for (const t of s.surface.tiles) t.revealed = true;
  s.surface.rev++;
  for (let f = 1; f <= B.MAX_FLOORS; f++) {
    if (f > B.START_SHAFT_FLOORS) debugPlaceRoom(s, 'shaft', f, B.SHAFT_COL);
    for (const r of W.ROOMS_PER_FLOOR) {
      if (f === 1) continue; // 1층은 시작 방(발전실·정수실)이 이미 있다
      debugPlaceRoom(s, r.type, f, r.col);
    }
  }
  s.time.tick = (W.DAY - 1) * DAY_TICKS + DAYLIGHT_TICKS;
  s.door.hp = 1e9; // 문이 안 부서져서 좀비가 계속 화면에 남게
  onNightStart(s, W.DAY);
  for (let k = 0; k < W.WARMUP_TICKS; k++) tick(s);
  s.events.length = 0;
  return s;
}

/** 벙커에서 방이 차지한 칸 수 */
export function occupiedCells(state) {
  let n = 0;
  for (const r of state.bunker.rooms) if (!B.ROOMS[r.type].attach) n += r.w;
  return n;
}
