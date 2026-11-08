// 낮밤·배속·고정 타임스텝. DOM 금지.

import { CONFIG } from '../config.js';
import { pushLog, pushEvent } from './log.js';
import { DAY_TICKS, DAYLIGHT_TICKS, RAID_WARNING_TICKS, getDay } from './clock.js';
import { step as surfaceStep, onNightStart as surfaceNight } from './surface.js';
import { step as bunkerStep } from './bunker.js';
import { step as raidStep } from './raid.js';
import { step as economyStep } from './economy.js';

export * from './clock.js';

const T = CONFIG.TIME;
const EPS = 1e-9;

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
    surfaceNight(state);
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
