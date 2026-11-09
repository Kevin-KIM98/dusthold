// 1틱(0.05초) 진행. 화면·입력과 무관한 순수 규칙.
import { moveCommander } from './commander.js';

export function step(state, input, balance) {
  moveCommander(state, input, balance);
  state.tick += 1;
  state.time = state.tick * balance.sim.tickSeconds;
}
