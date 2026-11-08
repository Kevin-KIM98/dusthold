// 낮밤·배속·고정 타임스텝. DOM 금지.

import { CONFIG } from '../config.js';
import { pushLog, pushEvent } from './state.js';
import { step as surfaceStep } from './surface.js';
import { step as bunkerStep } from './bunker.js';
import { step as raidStep } from './raid.js';
import { step as economyStep } from './economy.js';

const T = CONFIG.TIME;
const EPS = 1e-9;

export const DAY_TICKS = Math.round(T.DAY_SEC / T.TICK_SEC);
export const DAYLIGHT_TICKS = Math.round(T.DAYLIGHT_SEC / T.TICK_SEC);
export const RAID_WARNING_TICKS = Math.round(T.RAID_WARNING_SEC / T.TICK_SEC);

/** 1틱(0.1초) 진행 */
export function tick(state) {
  state.time.tick += 1;
  const inDay = state.time.tick % DAY_TICKS;
  const day = getDay(state);

  if (inDay === 0) {
    pushLog(state, 'log.newDay', { day });
    pushEvent(state, 'toast.newDay', { day });
  } else if (inDay === DAYLIGHT_TICKS) {
    pushLog(state, 'log.nightFalls', { day });
    pushEvent(state, 'toast.nightFalls', { day });
  } else if (inDay === DAYLIGHT_TICKS - RAID_WARNING_TICKS) {
    pushLog(state, 'log.raidWarning', { sec: T.RAID_WARNING_SEC });
    pushEvent(state, 'toast.raidWarning', { sec: T.RAID_WARNING_SEC });
  }

  economyStep(state);
  surfaceStep(state);
  bunkerStep(state);
  raidStep(state);
}

/**
 * 실제 흐른 시간(초)을 받아 배속을 곱해 틱을 돌린다. 돌린 틱 수를 돌려준다.
 * 일시정지면 0. 한 프레임이 너무 길면 잘라낸다.
 */
export function advance(state, realDtSec) {
  if (state.paused) return 0;
  const dt = Math.max(0, Math.min(realDtSec, T.MAX_FRAME_DT_SEC));
  state.time.acc += dt * state.speed;
  let n = 0;
  while (state.time.acc >= T.TICK_SEC - EPS && n < T.MAX_TICKS_PER_FRAME) {
    state.time.acc -= T.TICK_SEC;
    tick(state);
    n++;
  }
  if (n >= T.MAX_TICKS_PER_FRAME) state.time.acc = 0;
  return n;
}

export function setSpeed(state, speed) {
  if (!T.SPEEDS.includes(speed)) return false;
  state.speed = speed;
  state.paused = false;
  return true;
}

export function setPaused(state, paused) {
  state.paused = !!paused;
}

export function togglePaused(state) {
  state.paused = !state.paused;
  return state.paused;
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

/** 하루 안에서 흐른 초 */
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
