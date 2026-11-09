// 시작점: 데이터 불러오기 → sim 상태 → 화면·입력 연결 → 고정 타임스텝 루프
import { createState } from './sim/state.js';
import { step } from './sim/rules.js';
import { makeWorstScene } from './sim/debug.js';
import { createScene } from './render/scene.js';
import { createFollowCamera } from './render/camera.js';
import { createHud } from './render/hud.js';
import { createControls } from './input/controls.js';
import { STR } from './strings.js';

const params = new URLSearchParams(location.search);
const DEFAULT_SEED = 1;

async function boot() {
  const balance = await (await fetch('./data/balance.json')).json();
  const seed = params.has('seed') ? (parseInt(params.get('seed'), 10) >>> 0) : DEFAULT_SEED;
  const speed = params.has('fast') ? balance.sim.fastMultiplier : 1;

  const state = createState(balance, seed);
  if (params.has('worst')) makeWorstScene(state, balance);
  const canvas = document.getElementById('game');
  const ui = document.getElementById('ui');
  const view = createScene(state, balance, canvas);
  const cam = createFollowCamera(balance.camera, innerWidth / innerHeight);
  const controls = createControls(canvas, document.getElementById('joy'), balance);

  let paused = false;
  const hud = createHud(ui, balance, { showFps: params.has('worst'), onPause: p => { paused = p; }, onRestart: () => location.reload() });

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

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (!paused) {
      acc += dt * speed;
      let n = 0;
      while (acc >= TICK && n < balance.sim.maxTicksPerFrame) {
        lastInput = controls.read();
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
    events.length = 0;
    view.renderer.render(view.scene, cam.camera);
    hud.frame(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 디버그·테스트용 (게임 규칙에는 영향 없음)
  window.__game = { state, balance, camera: cam, view, isPaused: () => paused, ready: true };
}

boot().catch(err => {
  console.error(err);
  const el = document.getElementById('ui');
  if (el) el.innerHTML = `<div class="error">${STR.loadError}</div>`;
});
