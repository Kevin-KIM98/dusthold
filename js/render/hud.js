// 화면 위 UI (일시정지 버튼, 디버그 FPS, 안내 문구)
import * as THREE from 'three';
import { STR } from '../strings.js';

const _v = new THREE.Vector3();

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

  // 상단 오른쪽: 들고 있는 은화 수
  const coinBox = document.createElement('div');
  coinBox.className = 'coins';
  coinBox.setAttribute('aria-label', STR.coinsLabel);
  coinBox.innerHTML = '<span class="coin-icon"></span><span class="coin-n">0</span>';
  root.appendChild(coinBox);
  const coinN = coinBox.querySelector('.coin-n');
  let lastCoins = 0;

  // 패드 위 이름 + 남은 비용 (바닥 좌표를 화면 좌표로 옮겨 표시)
  const padLabels = new Map();
  function padLabel(id) {
    let el = padLabels.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'pad-label';
      el.dataset.pad = id;
      el.innerHTML = `<div class="pad-name">${STR.pads[id] || id}</div><div class="pad-cost"><span class="coin-icon"></span><span class="pad-n"></span></div>`;
      root.appendChild(el);
      padLabels.set(id, el);
    }
    return el;
  }

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
    /** 매 프레임: 은화 수·패드 숫자 갱신 */
    sync(state, camera) {
      const k = state.commander.coins;
      if (k !== lastCoins) {
        coinN.textContent = String(k);
        coinBox.classList.toggle('full', k >= 100);
        coinBox.classList.remove('bump'); void coinBox.offsetWidth; coinBox.classList.add('bump');
        lastCoins = k;
      }
      const w = innerWidth, h = innerHeight;
      for (const pad of state.pads) {
        const el = padLabel(pad.id);
        // 패드 앞쪽 모서리(화면 아래쪽) 밑에 표시 → 패드 위의 성주를 가리지 않음
        _v.set(pad.x + pad.half, 0, pad.z + pad.half).project(camera);
        const on = pad.open && _v.z < 1 && Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2;
        el.style.display = on ? '' : 'none';
        if (!on) continue;
        el.style.transform = `translate(${(_v.x + 1) / 2 * w}px, ${(1 - _v.y) / 2 * h}px) translate(-50%, 4px)`;
        const n = String(pad.cost - pad.paid);
        const nEl = el.querySelector('.pad-n');
        if (nEl.textContent !== n) nEl.textContent = n;
        el.classList.toggle('paying', pad.payAcc > 0);
      }
    },
    hideHint() { hint.classList.add('hidden'); },
    frame(dt) {
      if (!fpsEl) return;
      frames++; acc += dt;
      if (acc >= 0.5) { fpsEl.textContent = `${STR.fps} ${Math.round(frames / acc)}`; frames = 0; acc = 0; }
    },
  };
}
