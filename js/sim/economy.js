// 자원·전력·소비. M2: 저장 상한, 대기 생존자 입주. 생산·소비 규칙은 M3.
import { CONFIG } from '../config.js';
import { pushLog } from './log.js';

/** 자원을 더하고(저장 상한 적용) 실제로 들어간 양을 돌려준다. 통신부품은 상한 없음. */
export function addResource(state, res, n) {
  const r = state.resources;
  const before = r[res] || 0;
  const after = res === 'parts' ? before + n : Math.min(state.storageCap, before + n);
  r[res] = Math.max(before, after);
  return r[res] - before;
}

/** 입구 대기 생존자를 인구 상한까지 입주시킨다 */
export function admitWaiting(state) {
  while (state.waiting.length > 0 && state.survivors.length < state.popCap) {
    const s = state.waiting.shift();
    state.survivors.push(s);
    pushLog(state, 'log.joined', { name: s.name });
  }
}

/** 매 틱 호출 */
export function step(state) {
  admitWaiting(state);
}

/** 상단 바용 요약. low = 부족(빨간색) */
export function summarize(state) {
  const n = state.survivors.length;
  const r = state.resources;
  const needFood = n * CONFIG.SURVIVOR.FOOD_PER_DAY;
  const needWater = n * CONFIG.SURVIVOR.WATER_PER_DAY;
  return {
    food: { value: r.food, low: r.food < needFood },
    water: { value: r.water, low: r.water < needWater },
    wood: { value: r.wood, low: r.wood <= 0 },
    scrap: { value: r.scrap, low: r.scrap <= 0 },
    power: {
      produced: state.power.produced,
      consumed: state.power.consumed,
      low: state.power.consumed > state.power.produced,
    },
    parts: { value: r.parts, low: false },
    pop: { count: n, cap: state.popCap, low: n > state.popCap, waiting: state.waiting.length },
  };
}
