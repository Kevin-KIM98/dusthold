// 입력: M1은 PC 단축키만. 탭·드래그·핀치는 M2/M3에서 각 화면에 붙인다.
import { CONFIG } from './config.js';

export function initInput(handlers) {
  const K = CONFIG.INPUT;
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === K.KEY_PAUSE) {
      e.preventDefault();
      handlers.onTogglePause();
    } else if (K.KEY_SPEED[e.key] !== undefined) {
      handlers.onSpeed(K.KEY_SPEED[e.key]);
    } else if (e.key === K.KEY_TOGGLE_VIEW) {
      e.preventDefault();
      handlers.onToggleView();
    } else if (e.key === K.KEY_CLOSE) {
      handlers.onClose();
    } else if (e.key === K.KEY_DEBUG) {
      e.preventDefault();
      handlers.onDebug();
    }
  });
}
