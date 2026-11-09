// 화면 위 UI (일시정지 버튼, 디버그 FPS, 안내 문구)
import * as THREE from 'three';
import { STR } from '../strings.js';
import { secondsToNextWave, waveStartSeconds } from '../sim/waves.js';

const _v = new THREE.Vector3();

export function createHud(root, balance, { showFps, onPause, onRestart, onNewGame, onNextStage, sound, resumeInfo = null, onResume }) {
  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'ui btn pause';
  pauseBtn.setAttribute('aria-label', STR.pause);
  pauseBtn.textContent = 'Ⅱ';
  root.appendChild(pauseBtn);

  // 음소거 버튼 (일시정지 아래)
  const muteBtn = document.createElement('button');
  muteBtn.className = 'ui btn mute';
  const drawMute = () => {
    const m = sound.isMuted();
    muteBtn.textContent = m ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', m ? STR.unmute : STR.mute);
    muteBtn.setAttribute('aria-pressed', String(m));
  };
  muteBtn.addEventListener('click', () => { sound.setMuted(!sound.isMuted()); drawMute(); });
  drawMute();
  root.appendChild(muteBtn);

  const overlay = document.createElement('div');
  overlay.className = 'ui overlay hidden';
  overlay.innerHTML = `<div class="panel"><h2>${STR.paused}</h2><button class="btn wide p-go">${STR.resume}</button><button class="btn wide ghost p-new">${STR.newGame}</button></div>`;
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
  waveBox.innerHTML = '<div class="wave-s"></div><div class="wave-n"></div><div class="wave-bar"><i></i></div><div class="wave-t"></div>';
  root.appendChild(waveBox);
  const waveS = waveBox.querySelector('.wave-s');
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

  // 승리/패배 화면
  const result = document.createElement('div');
  result.className = 'ui overlay result hidden';
  result.innerHTML = `<div class="panel"><h2 class="r-title"></h2><p class="r-wave"></p><p class="r-kills"></p><p class="r-hint">${STR.nextHint}</p><button class="btn wide r-next">${STR.nextStage}</button><button class="btn wide r-again">${STR.restart}</button></div>`;
  root.appendChild(result);
  result.querySelector('.r-again').addEventListener('click', () => onRestart());
  result.querySelector('.r-next').addEventListener('click', () => {
    onNextStage();
    shown = false;
    result.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
  });
  let shown = false;

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
  overlay.querySelector('.p-go').addEventListener('click', () => setPaused(false));
  overlay.querySelector('.p-new').addEventListener('click', () => onNewGame());

  // 다시 접속했을 때: 이어서 하기 / 처음부터
  if (resumeInfo) {
    const box = document.createElement('div');
    box.className = 'ui overlay resume';
    box.innerHTML = `<div class="panel"><h2>${STR.resumeTitle}</h2><p class="r-info">${STR.resumeInfo(resumeInfo.stage, resumeInfo.wave, resumeInfo.coins)}</p>`
      + `<button class="btn wide r-go">${STR.continueSave}</button><button class="btn wide ghost r-new">${STR.newGame}</button></div>`;
    root.appendChild(box);
    box.querySelector('.r-go').addEventListener('click', () => { box.remove(); onResume(); });
    box.querySelector('.r-new').addEventListener('click', () => onNewGame());
  }

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
      waveS.textContent = STR.stage(state.stage || 1);
      waveN.textContent = STR.wave(state.waves.current, total);
      const left = secondsToNextWave(state, balance);
      if (left >= 0) {
        const n = state.waves.current + 1;
        const span = n === 1 ? waveStartSeconds(1, balance) : waveStartSeconds(n, balance) - waveStartSeconds(n - 1, balance);
        waveBar.style.width = `${Math.max(0, 1 - left / span) * 100}%`;
        waveT.textContent = n === 1 ? STR.firstWave(Math.ceil(left)) : STR.nextWave(Math.ceil(left));
      } else {
        waveBar.style.width = '100%';
        waveT.textContent = STR.lastWave;
      }
      castleFill.style.width = `${state.castle.hp / state.castle.maxHp * 100}%`;

      for (const e of events) {
        if (e.type === 'hit') spawnDmg(e.x, e.z, String(e.dmg), e.target !== 'enemy' ? 'to-ally' : e.by === 'commander' ? 'to-enemy big' : 'to-enemy');
        else if (e.type === 'waveStart') { banner.textContent = STR.waveStart(e.wave); banner.classList.remove('hidden'); bannerT = 2; }
        else if (e.type === 'stageStart') { banner.textContent = STR.stageStart(e.stage); banner.classList.remove('hidden'); bannerT = 2.5; }
      }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.add('hidden'); }

      if (state.result && !shown) {
        shown = true;
        const win = state.result === 'win';
        result.classList.toggle('win', win);
        result.querySelector('.r-title').textContent = win ? STR.stageClear(state.stage || 1) : STR.lose;
        // 이기면 '다음 판'(+작은 처음부터), 지면 '다시 하기'만
        result.querySelector('.r-next').style.display = win ? '' : 'none';
        result.querySelector('.r-hint').style.display = win ? '' : 'none';
        result.querySelector('.r-again').classList.toggle('ghost', win);
        result.querySelector('.r-again').textContent = win ? STR.newGame : STR.restart;
        // 버틴 웨이브: 이기면 전부, 지면 무너지기 전까지 끝까지 막아낸 웨이브(= 진행 중이던 웨이브 - 1)
        const held = win ? balance.waves.total : Math.max(0, state.waves.current - 1);
        result.querySelector('.r-wave').textContent = STR.survived(held, balance.waves.total);
        result.querySelector('.r-kills').textContent = STR.kills(state.kills);
        result.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
      }
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
