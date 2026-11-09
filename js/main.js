// 시작점: 데이터 불러오기 → sim 상태 → 화면·입력 연결 → 고정 타임스텝 루프
import { createState } from './sim/state.js';
import { step } from './sim/rules.js';
import { makeWorstScene } from './sim/debug.js';
import { createScene } from './render/scene.js';
import { loadAssets } from './render/assets.js';
import { createFollowCamera } from './render/camera.js';
import { createHud } from './render/hud.js';
import { createControls } from './input/controls.js';
import { STR } from './strings.js';
import { createSound } from './audio/sound.js';
import { loadSave, writeSave, clearSave } from './storage.js';
import { summary } from './sim/save.js';

const params = new URLSearchParams(location.search);
const DEFAULT_SEED = 1;

async function boot() {
  const balance = await (await fetch('./data/balance.json')).json();
  const seed = params.has('seed') ? (parseInt(params.get('seed'), 10) >>> 0) : DEFAULT_SEED;
  const speed = params.has('fast') ? balance.sim.fastMultiplier : 1;

  // 이어하기: 이 브라우저에 저장된 판이 있으면 그 상태로 시작 (?worst 디버그 장면은 저장·불러오기 안 함)
  const worst = params.has('worst');
  const saved = worst ? null : loadSave(balance);
  const state = saved || createState(balance, seed);
  if (worst) makeWorstScene(state, balance);
  const canvas = document.getElementById('game');
  const ui = document.getElementById('ui');
  // M6 아트: ?noart = 도형만, ?assets=다른목록.json = 다른 아트 목록
  const artCfg = balance.render.art;
  const art = params.has('noart') ? { models: {}, textures: {}, report: [] }
    : await loadAssets(params.get('assets') || artCfg.manifest, artCfg);
  const view = createScene(state, balance, canvas, art);
  const cam = createFollowCamera(balance.camera, innerWidth / innerHeight);
  const controls = createControls(canvas, document.getElementById('joy'), balance);

  let paused = !!saved; // 이어하기 창에서 고를 때까지 멈춤
  const sound = createSound(balance.sound);
  const hud = createHud(ui, balance, { showFps: params.has('worst'), onPause: p => { paused = p; }, onRestart: newGame, onNewGame: newGame, sound,
    resumeInfo: saved ? summary(saved) : null, onResume: () => { paused = false; } });

  // 처음부터: 저장을 지우고 새로 불러오기
  // (떠나면서 자동 저장이 옛 판을 다시 쓰지 않도록 leaving 표시)
  let leaving = false;
  function newGame() { leaving = true; clearSave(); location.reload(); }
  // 자동 저장: 몇 초마다 + 화면을 떠날 때. 끝난 판은 저장을 지움
  const save = () => {
    if (worst || leaving) return;
    if (state.result) clearSave();
    else if (state.tick > 0) writeSave(state, balance);
  };
  let saveAcc = 0;
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

  function resize() {
    view.renderer.setSize(innerWidth, innerHeight, false);
    cam.resize(innerWidth / innerHeight);
    view.setFog(cam.distance() + balance.camera.fogNear, cam.distance() + balance.camera.fogFar);
  }
  addEventListener('resize', resize);
  resize();

  const TICK = balance.sim.tickSeconds;
  let acc = 0, last = performance.now(), lastInput = { x: 0, z: 0 };
  const events = []; // 이번 프레임에 sim에서 나온 이벤트 모음 (연출용)
  let ended = false;

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (!paused) {
      acc += dt * speed;
      let n = 0;
      while (acc >= TICK && n < balance.sim.maxTicksPerFrame) {
        // 테스트용: __game.inputOverride가 있으면 그 입력을 씀 (자동 플레이)
        lastInput = window.__game && window.__game.inputOverride ? window.__game.inputOverride() : controls.read();
        if (lastInput.x || lastInput.z) hud.hideHint();
        step(state, lastInput, balance);
        for (const e of state.events) events.push(e);
        acc -= TICK; n++;
      }
      if (n === balance.sim.maxTicksPerFrame) acc = 0;
    }
    const alpha = paused ? 1 : acc / TICK;
    const c = state.commander;
    const fx = c.prevX + (c.x - c.prevX) * alpha, fz = c.prevZ + (c.z - c.prevZ) * alpha;
    cam.update(fx, fz, dt);
    view.sync(state, alpha, cam.target, events, now / 1000, dt, cam.camera);
    hud.sync(state, cam.camera, events, dt);
    sound.events(events);
    events.length = 0;
    view.renderer.render(view.scene, cam.camera);
    hud.frame(dt);
    saveAcc += dt;
    if (saveAcc >= balance.save.intervalSeconds && !paused) { saveAcc = 0; save(); }
    if (state.result && !worst && !ended) { ended = true; clearSave(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 디버그·테스트용 (게임 규칙에는 영향 없음)
  window.__game = { state, balance, camera: cam, view, sound, art: art.report, isPaused: () => paused, ready: true, inputOverride: null, saveNow: save, resumed: !!saved };
}

boot().catch(err => {
  console.error(err);
  const el = document.getElementById('ui');
  if (el) el.innerHTML = `<div class="error">${STR.loadError}</div>`;
});
