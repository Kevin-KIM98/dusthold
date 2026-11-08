// 시계 계산만 (부작용 없음). time.js와 다른 sim 모듈이 같이 쓴다 — 순환 import 방지용.
import { CONFIG } from '../config.js';

const T = CONFIG.TIME;

export const DAY_TICKS = Math.round(T.DAY_SEC / T.TICK_SEC);
export const DAYLIGHT_TICKS = Math.round(T.DAYLIGHT_SEC / T.TICK_SEC);
export const RAID_WARNING_TICKS = Math.round(T.RAID_WARNING_SEC / T.TICK_SEC);

export function secToTicks(sec) {
  return Math.round(sec / T.TICK_SEC);
}

/** 1일차부터 */
export function getDay(state) {
  return Math.floor(state.time.tick / DAY_TICKS) + 1;
}

export function getTickInDay(state) {
  return state.time.tick % DAY_TICKS;
}

export function isNight(state) {
  return getTickInDay(state) >= DAYLIGHT_TICKS;
}

export function getPhase(state) {
  return isNight(state) ? 'night' : 'day';
}

export function getDayElapsedSec(state) {
  return getTickInDay(state) * T.TICK_SEC;
}

/** 시계 표시용 { hour, minute } — 하루 0초가 CLOCK_START_HOUR */
export function getClock(state) {
  const frac = getDayElapsedSec(state) / T.DAY_SEC;
  const totalMin = Math.floor(((T.CLOCK_START_HOUR + frac * 24) % 24) * 60);
  return { hour: Math.floor(totalMin / 60), minute: totalMin % 60 };
}

/** 낮이면 밤(습격)까지, 밤이면 새벽까지 남은 초 */
export function getSecondsToPhaseChange(state) {
  const inDay = getTickInDay(state);
  const target = isNight(state) ? DAY_TICKS : DAYLIGHT_TICKS;
  return (target - inDay) * T.TICK_SEC;
}
