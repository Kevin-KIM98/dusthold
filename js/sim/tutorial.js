// 1일차 가이드 (plan v0.3). 각 단계는 게임 상태로 판정한다 — 하면 자동으로 다음 단계. DOM 금지.
import { CONFIG } from '../config.js';
import { pushLog, pushEvent } from './log.js';
import { isDug, digAt, roomAt, workersOf } from './bunker.js';

const TU = CONFIG.TUTORIAL;

export const TUTORIAL_STEPS = Object.freeze(['gen', 'water', 'dig', 'explore', 'guard', 'guardman', 'gather']);

export function createTutorial() {
  return { step: 0, done: false, skipped: false };
}

const roomsOf = (s, type) => s.bunker.rooms.filter((r) => r.type === type);
const staffed = (s, type) => roomsOf(s, type).some((r) => workersOf(s, r.id).length > 0);

const CHECKS = {
  gen: (s) => staffed(s, 'generator'),
  water: (s) => staffed(s, 'water'),
  dig: (s) => !!digAt(s, TU.DIG_CELL.floor, TU.DIG_CELL.col) || isDug(s, TU.DIG_CELL.floor, TU.DIG_CELL.col) || s.bunker.digs.length > 0,
  explore: (s) => s.surface.expeditions.some((e) => e.kind === 'explore') || s.stats.explored > 0,
  guard: (s) => roomsOf(s, 'guard').length > 0,
  guardman: (s) => staffed(s, 'guard'),
  gather: (s) => s.survivors.some((v) => v.job === 'gather'),
};

export function isTutorialActive(state) {
  const t = state.tutorial;
  return !!t && !t.done && !t.skipped;
}

export function currentStep(state) {
  return isTutorialActive(state) ? TUTORIAL_STEPS[state.tutorial.step] : null;
}

/** 매 틱: 끝난 단계를 넘긴다 (여러 단계를 한꺼번에 이미 했으면 한꺼번에) */
export function updateTutorial(state) {
  if (!isTutorialActive(state)) return;
  const t = state.tutorial;
  while (t.step < TUTORIAL_STEPS.length && CHECKS[TUTORIAL_STEPS[t.step]](state)) {
    t.step++;
    if (t.step < TUTORIAL_STEPS.length) pushEvent(state, 'toast.tutorialStep', { n: t.step, total: TUTORIAL_STEPS.length });
  }
  if (t.step >= TUTORIAL_STEPS.length) {
    t.done = true;
    pushLog(state, 'log.tutorialDone', null);
    pushEvent(state, 'toast.tutorialDone', null);
  }
}

export function skipTutorial(state) {
  if (!isTutorialActive(state)) return false;
  state.tutorial.skipped = true;
  pushLog(state, 'log.tutorialSkipped', null);
  return true;
}

/** 경비실 칸이 이미 다른 방이면 (드물게) 가이드는 '어디든 경비실'로 안내 */
export function guardCellFree(state) {
  const r = roomAt(state, TU.DIG_CELL.floor, TU.DIG_CELL.col);
  return !r || r.type === 'guard';
}
