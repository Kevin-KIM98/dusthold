// 일차별 미션 (plan v0.4). DOM 금지.
// 필수 = 생존 보장(오늘 밤 방어 화력, 내일 아침 식량·물), 목표 = 1장을 깨기 위한 성장 순서.
import { CONFIG } from '../config.js';
import { getDay, isNight } from './clock.js';
import { nightForecast, defenseDps } from './raid.js';

const M = CONFIG.MISSIONS;
const SV = CONFIG.SURVIVOR;

export function goalsFor(day) {
  return M.GOALS[Math.min(day, M.LAST_DAY)] || [];
}

const doneRooms = (s, type) => s.bunker.rooms.filter((r) => r.type === type && r.done).length;

/** 목표 하나의 진행 { cur, need, done } */
export function evalGoal(state, g) {
  const s = state;
  switch (g.kind) {
    case 'build': { const cur = doneRooms(s, g.room); return { cur, need: g.n, done: cur >= g.n }; }
    case 'turret': { const cur = doneRooms(s, 'turret'); return { cur, need: g.n, done: cur >= g.n }; }
    case 'door': return { cur: s.door.level, need: g.level, done: s.door.level >= g.level };
    case 'explore': return { cur: s.stats.explored, need: g.n, done: s.stats.explored >= g.n };
    case 'armed': { const cur = s.survivors.filter((v) => v.weapon).length; return { cur, need: g.n, done: cur >= g.n }; }
    case 'nest': { const cur = s.surface.tiles.filter((t) => t.type === 'nest' && t.cleared).length; return { cur, need: g.n, done: cur >= g.n }; }
    case 'baseFound': { const done = s.surface.tiles.some((t) => t.type === 'base' && t.revealed); return { cur: done ? 1 : 0, need: 1, done }; }
    case 'parts': { const done = s.resources.parts > 0 || doneRooms(s, 'radio') > 0 || s.surface.tiles.some((t) => t.type === 'base' && t.cleared); return { cur: done ? 1 : 0, need: 1, done }; }
    case 'radio': { const done = doneRooms(s, 'radio') > 0; return { cur: done ? 1 : 0, need: 1, done }; }
    default: return { cur: 0, need: 1, done: false };
  }
}

/**
 * 오늘의 미션 목록. 각 항목 { id, survival, cur, need, done, params }
 * - defense: 오늘 밤 방어 화력 (필요 없으면 빠짐). need가 Infinity면 지금 문으로는 막을 수 없다는 뜻.
 * - food / water: 내일 아침 정산에 필요한 양
 */
export function dayMissions(state) {
  const day = getDay(state);
  const out = [];
  const fc = nightForecast(state);
  if (fc.night && fc.repelled) {
    out.push({ id: 'defense', survival: true, done: true, cur: 0, need: 0, params: { n: fc.n }, repelled: true });
  } else if (fc.required > 0) {
    const cur = defenseDps(state);
    out.push({ id: 'defense', survival: true, cur, need: fc.required, done: cur >= fc.required, params: { n: fc.n } });
  }
  const n = state.survivors.length;
  const food = Math.floor(state.resources.food), water = Math.floor(state.resources.water);
  out.push({ id: 'food', survival: true, cur: food, need: n * SV.FOOD_PER_DAY, done: food >= n * SV.FOOD_PER_DAY, params: null });
  out.push({ id: 'water', survival: true, cur: water, need: n * SV.WATER_PER_DAY, done: water >= n * SV.WATER_PER_DAY, params: null });
  goalsFor(day).forEach((g, k) => out.push({ id: 'goal' + k, survival: false, goal: g, ...evalGoal(state, g) }));
  return out;
}

/** 필수 미션을 모두 지켰나 */
export function survivalMet(state) {
  return dayMissions(state).every((m) => !m.survival || m.done);
}

export { isNight };
