// 스테이지: 10웨이브를 막으면 다음 스테이지로. 기지·은화는 이어지고 적은 점점 강해진다.
import { buildWalls } from './walls.js';

/** 스테이지 s의 배율 (s = 1부터) */
export function stageScale(stage, balance) {
  const g = balance.stages, k = Math.max(0, (stage || 1) - 1);
  return { hp: 1 + g.hpGrowth * k, attack: 1 + g.attackGrowth * k, size: 1 + g.sizeGrowth * k };
}

/** 이긴 판 → 다음 스테이지 시작 상태로 (기지·은화 유지, 성채·성벽 정비, 웨이브 처음부터) */
export function nextStage(state, balance) {
  if (state.result !== 'win') return false;
  state.stage = (state.stage || 1) + 1;
  state.result = null;
  state.waves = { current: 0, queue: [], paused: false, startTick: state.tick }; // waves.js createWaves와 같은 모양
  state.castle.hp = state.castle.maxHp;
  if (state.wallLevel > 0) buildWalls(state, balance, state.wallLevel);
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
