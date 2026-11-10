// 스테이지: 적 기지 2곳을 모두 점령하면 다음 스테이지로. 기지·은화는 이어지고 적은 점점 강해진다.
import { buildWalls } from './walls.js';
import { createCamps } from './camps.js';
export { stageScale } from './scale.js';

/** 이긴 판 → 다음 스테이지 시작 상태로 (기지·은화 유지, 성채·성벽 정비, 적 기지 새로) */
export function nextStage(state, balance) {
  if (state.result !== 'win') return false;
  state.stage = (state.stage || 1) + 1;
  state.result = null;
  state.spawn = { startTick: state.tick, paused: false };
  state.castle.hp = state.castle.maxHp;
  if (state.wallLevel > 0) {
    buildWalls(state, balance, state.wallLevel);
    const wp = state.pads.find(p => p.id === 'walls');
    if (wp && wp.rebuild) { wp.done = true; wp.rebuild = false; wp.paid = 0; }
  }
  state.camps = createCamps(state, balance);
  const c = state.commander;
  if (!c.alive) {
    const s = balance.map.commanderStart;
    c.alive = true; c.respawn = 0;
    c.x = c.prevX = s.x; c.z = c.prevZ = s.z;
    c.trail = [[s.x, s.z]];
  }
  c.hp = balance.commander.hp;
  state.events.push({ type: 'stageStart', stage: state.stage });
  return true;
}
