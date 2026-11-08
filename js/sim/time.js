// 낮밤·배속·고정 타임스텝. DOM 금지.

import { CONFIG } from '../config.js';
import { pushLog, pushEvent } from './log.js';
import { DAY_TICKS, DAYLIGHT_TICKS, RAID_WARNING_TICKS, getDay } from './clock.js';
import { step as surfaceStep, onNightStart as surfaceNight } from './surface.js';
import { step as bunkerStep } from './bunker.js';
import { step as raidStep, onNightStart as raidNight, onDawn as raidDawn, planNight } from './raid.js';
import { step as economyStep, onDawn as economyDawn, onNightStart as economyNight } from './economy.js';
import { updateTutorial } from './tutorial.js';

export * from './clock.js';

const T = CONFIG.TIME;
const EPS = 1e-9;

/** 1틱(0.1초) 진행 */
export function tick(state) {
  state.time.tick += 1;
  const inDay = state.time.tick % DAY_TICKS;
  const day = getDay(state);

  if (inDay === 0) {
    raidDawn(state);
    economyDawn(state);
    planNight(state, day); // 오늘 밤 좀비 명단을 새벽에 정한다 (미션에 보여주려고)
    pushLog(state, 'log.newDay', { day });
    pushEvent(state, 'toast.newDay', { day });
  } else if (inDay === DAYLIGHT_TICKS) {
    pushLog(state, 'log.nightFalls', { day });
    pushEvent(state, 'toast.nightFalls', { day });
    surfaceNight(state);
    economyNight(state);
    raidNight(state, day);
  } else if (inDay === DAYLIGHT_TICKS - RAID_WARNING_TICKS) {
    pushLog(state, 'log.raidWarning', { sec: T.RAID_WARNING_SEC });
    pushEvent(state, 'toast.raidWarning', { sec: T.RAID_WARNING_SEC });
  }

  economyStep(state);
  surfaceStep(state);
  bunkerStep(state);
  raidStep(state);
  updateTutorial(state);
  checkOutcome(state);
}

/** 1장 클리어(무선실 완공) / 게임 오버(생존자 0명, 대기자도 없음) */
export function checkOutcome(state) {
  if (state.outcome) return state.outcome;
  if (state.bunker.rooms.some((r) => r.type === 'radio' && r.done)) {
    state.outcome = 'victory';
    pushLog(state, 'log.victory', { day: getDay(state) });
    pushEvent(state, 'outcome.victory', null);
  } else if (state.survivors.length === 0 && state.waiting.length === 0) {
    state.outcome = 'defeat';
    pushLog(state, 'log.defeat', { day: getDay(state) });
    pushEvent(state, 'outcome.defeat', null);
  }
  return state.outcome;
}

/** 결과가 나면 시뮬레이션을 멈춘다 (클리어 뒤 '계속 둘러보기'는 예외) */
export function isFinished(state) {
  return !!state.outcome && !(state.outcome === 'victory' && state.afterVictory);
}

/**
 * 실제 흐른 시간(초)을 받아 배속을 곱해 틱을 돌린다. 돌린 틱 수를 돌려준다.
 * 일시정지면 0. 한 프레임이 너무 길면 잘라낸다.
 */
export function advance(state, realDtSec) {
  if (state.paused || isFinished(state)) return 0;
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
