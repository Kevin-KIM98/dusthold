// 화면 위 UI (일시정지 버튼, 디버그 FPS, 안내 문구)
import { STR } from '../strings.js';

export function createHud(root, { showFps, onPause }) {
  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'ui btn pause';
  pauseBtn.setAttribute('aria-label', STR.pause);
  pauseBtn.textContent = 'Ⅱ';
  root.appendChild(pauseBtn);

  const overlay = document.createElement('div');
  overlay.className = 'ui overlay hidden';
  overlay.innerHTML = `<div class="panel"><h2>${STR.paused}</h2><button class="btn wide">${STR.resume}</button></div>`;
  root.appendChild(overlay);

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = STR.hintMove;
  root.appendChild(hint);

  let fpsEl = null, frames = 0, acc = 0;
  if (showFps) {
    fpsEl = document.createElement('div');
    fpsEl.className = 'fps';
    root.appendChild(fpsEl);
  }

  const setPaused = p => { overlay.classList.toggle('hidden', !p); onPause(p); };
  pauseBtn.addEventListener('click', () => setPaused(true));
  overlay.querySelector('button').addEventListener('click', () => setPaused(false));

  return {
    hideHint() { hint.classList.add('hidden'); },
    frame(dt) {
      if (!fpsEl) return;
      frames++; acc += dt;
      if (acc >= 0.5) { fpsEl.textContent = `${STR.fps} ${Math.round(frames / acc)}`; frames = 0; acc = 0; }
    },
  };
}
