// 기록(저장됨)과 이벤트(토스트용, 저장 안 됨).
import { CONFIG } from '../config.js';

export function pushLog(state, key, params) {
  state.log.push({ tick: state.time.tick, key, params: params || null });
  if (state.log.length > CONFIG.UI.LOG_MAX) {
    state.log.splice(0, state.log.length - CONFIG.UI.LOG_MAX);
  }
}

export function pushEvent(state, key, params) {
  state.events.push({ key, params: params || null });
}
