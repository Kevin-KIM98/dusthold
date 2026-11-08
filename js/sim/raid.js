// 습격: 좀비·방폭문·경비·포탑·침입은 M4. M2에서는 마릿수 공식만 (둥지 연동 확인용). DOM 금지.
import { CONFIG } from '../config.js';

const R = CONFIG.RAID;
const NEST = CONFIG.SURFACE.TILES.nest;

/** 링 3 이내 미제거 둥지 수 (안개에 가려진 것도 포함 — 좀비는 보이든 말든 있다) */
export function activeNestCount(state) {
  return state.surface.tiles.filter((t) => t.type === 'nest' && !t.cleared && t.ring <= NEST.raidBonusMaxRing).length;
}

/** plan.md ③: min(4 + 2×(일차−1) + 2×(둥지 수), 40), 5의 배수 날 ×1.5 */
export function getRaidSize(state, day) {
  const base = R.BASE + R.PER_DAY * (day - 1) + NEST.raidBonus * activeNestCount(state);
  const mult = day % R.BIG_EVERY_DAYS === 0 ? R.BIG_MULT : 1;
  return Math.min(Math.round(base * mult), R.MAX);
}

export function step(state) {}
