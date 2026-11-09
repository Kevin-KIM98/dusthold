// 화면 위 UI (일시정지 버튼, 디버그 FPS, 안내 문구)
import * as THREE from 'three';
import { STR } from '../strings.js';
import { secondsToNextWave, waveStartSeconds } from '../sim/waves.js';

const _v = new THREE.Vector3();

export function createHud(root, balance, { showFps, onPause }) {
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

  // 상단 왼쪽: 웨이브 + 다음 웨이브까지 남은 시간 바
  const waveBox = document.createElement('div');
  waveBox.className = 'wave';
  waveBox.innerHTML = '<div class="wave-n"></div><div class="wave-bar"><i></i></div><div class="wave-t"></div>';
  root.appendChild(waveBox);
  const waveN = waveBox.querySelector('.wave-n'), waveBar = waveBox.querySelector('.wave-bar i'), waveT = waveBox.querySelector('.wave-t');

  // 상단 가운데: 성채 체력
  const castleBox = document.createElement('div');
  castleBox.className = 'castle-hp';
  castleBox.innerHTML = `<span>${STR.castle}</span><div class="hpbar"><i></i></div>`;
  root.appendChild(castleBox);
  const castleFill = castleBox.querySelector('i');

  const banner = document.createElement('div');
  banner.className = 'banner hidden';
  root.appendChild(banner);
  let bannerT = 0;

  const downMsg = document.createElement('div');
  downMsg.className = 'down hidden';
  root.appendChild(downMsg);

  // 데미지 숫자 (미리 만들어 둔 칸을 돌려 씀)
  const dmgMax = balance.render.maxDamageNumbers, dmgDur = balance.render.damageNumberSeconds;
  const dmgPool = [], dmgLive = [];
  for (let i = 0; i < dmgMax; i++) {
    const el = document.createElement('div');
    el.className = 'dmg';
    el.style.display = 'none';
    root.appendChild(el);
    dmgPool.push(el);
  }
  const spawnDmg = (x, z, text, cls) => {
    const el = dmgPool.length ? dmgPool.pop() : dmgLive.shift().el;
    el.textContent = text;
    el.className = `dmg ${cls}`;
    dmgLive.push({ el, x: x + (Math.random() - 0.5) * 0.6, z, t: 0 });
  };

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
    sync(state, camera, events = [], dt = 0) {
      const k = state.commander.coins;
      if (k !== lastCoins) {
        coinN.textContent = String(k);
        coinBox.classList.toggle('full', k >= 100);
        coinBox.classList.remove('bump'); void coinBox.offsetWidth; coinBox.classList.add('bump');
        lastCoins = k;
      }
      const w = innerWidth, h = innerHeight;
      const total = balance.waves.total;
      waveN.textContent = STR.wave(state.waves.current, total);
      const left = secondsToNextWave(state, balance);
      if (left >= 0) {
        const n = state.waves.current + 1;
        const span = n === 1 ? waveStartSeconds(1, balance) : waveStartSeconds(n, balance) - waveStartSeconds(n - 1, balance);
        waveBar.style.width = `${(1 - left / span) * 100}%`;
        waveT.textContent = n === 1 ? STR.firstWave(Math.ceil(left)) : STR.nextWave(Math.ceil(left));
      } else {
        waveBar.style.width = '100%';
        waveT.textContent = STR.lastWave;
      }
      castleFill.style.width = `${state.castle.hp / state.castle.maxHp * 100}%`;

      for (const e of events) {
        if (e.type === 'hit') spawnDmg(e.x, e.z, String(e.dmg), e.target === 'enemy' ? 'to-enemy' : 'to-ally');
        else if (e.type === 'waveStart') { banner.textContent = STR.waveStart(e.wave); banner.classList.remove('hidden'); bannerT = 2; }
      }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.add('hidden'); }

      const c = state.commander;
      downMsg.classList.toggle('hidden', c.alive);
      if (!c.alive) downMsg.textContent = STR.down(Math.ceil(c.respawn * balance.sim.tickSeconds));

      for (let i = dmgLive.length - 1; i >= 0; i--) {
        const d = dmgLive[i];
        d.t += dt;
        if (d.t >= dmgDur) { d.el.style.display = 'none'; dmgPool.push(d.el); dmgLive.splice(i, 1); continue; }
        _v.set(d.x, 1.8 + d.t * 1.5, d.z).project(camera);
        if (_v.z > 1) { d.el.style.display = 'none'; continue; }
        d.el.style.display = '';
        d.el.style.opacity = String(1 - d.t / dmgDur);
        d.el.style.transform = `translate(${(_v.x + 1) / 2 * w}px, ${(1 - _v.y) / 2 * h}px) translate(-50%, -50%)`;
      }

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
