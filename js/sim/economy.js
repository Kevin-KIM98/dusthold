// 자원·전력·소비. M1에서는 상단 바에 보여줄 요약만 만든다. 생산·소비 규칙은 M3.

import { CONFIG } from '../config.js';

/** 매 틱 호출. M3에서 생산·소비를 넣는다. */
export function step(state) {}

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
    pop: { count: n, cap: state.popCap, low: n > state.popCap },
  };
}
