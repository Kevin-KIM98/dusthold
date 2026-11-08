// 상단 바·시계·배속·탭·패널·토스트·기록. DOM은 여기와 main.js, input.js만 만진다.

import { CONFIG } from '../config.js';
import { t } from '../strings.js';
import { topBarModel, clockModel, logModel } from './viewModel.js';

const el = {};
let lastRendered = { bar: null, clock: null, logLen: -1, logLast: null };

export function initUI(handlers) {
  const q = (id) => document.getElementById(id);
  el.title = q('title');
  el.btnNew = q('btn-new');
  el.btnContinue = q('btn-continue');
  el.game = q('game');
  el.bar = q('topbar');
  el.clkDay = q('clk-day');
  el.clkTime = q('clk-time');
  el.clkPhase = q('clk-phase');
  el.clkCount = q('clk-count');
  el.speedBtns = Array.from(document.querySelectorAll('[data-speed]'));
  el.tabs = Array.from(document.querySelectorAll('[data-tab]'));
  el.canvas = q('view');
  el.logView = q('log-view');
  el.panel = q('panel');
  el.panelBody = q('panel-body');
  el.panelToggle = q('panel-toggle');
  el.toasts = q('toasts');
  el.debug = q('debug');

  // 정적 문자열
  q('title-name').textContent = t('title.name');
  q('title-sub').textContent = t('title.sub');
  el.btnNew.textContent = t('title.new');
  el.btnContinue.textContent = t('title.continue');
  q('panel-title').textContent = t('panel.title');
  el.panelBody.textContent = t('panel.none');
  for (const b of el.speedBtns) {
    const v = b.dataset.speed;
    const label = v === 'pause' ? t('speed.pause') : t('speed.x', { n: v });
    b.textContent = v === 'pause' ? '' : label; // 일시정지는 CSS 도형 아이콘
    b.setAttribute('aria-label', label);
    b.title = label;
  }
  for (const b of el.tabs) b.textContent = t('tab.' + b.dataset.tab);

  // 자원 바 칸 만들기
  el.bar.innerHTML = '';
  el.resEls = {};
  for (const id of [...CONFIG.RESOURCE_ORDER, 'pop']) {
    const item = document.createElement('div');
    item.className = 'res';
    item.dataset.res = id;
    const ico = document.createElement('span');
    ico.className = 'ico ico-' + id;
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = t('res.' + id);
    const val = document.createElement('span');
    val.className = 'val';
    item.append(ico, lbl, val);
    el.bar.appendChild(item);
    el.resEls[id] = { item, val };
  }

  // 핸들러
  el.btnNew.addEventListener('click', handlers.onNewGame);
  el.btnContinue.addEventListener('click', handlers.onContinue);
  for (const b of el.speedBtns) {
    b.addEventListener('click', () => {
      if (b.dataset.speed === 'pause') handlers.onTogglePause();
      else handlers.onSpeed(Number(b.dataset.speed));
    });
  }
  for (const b of el.tabs) b.addEventListener('click', () => handlers.onTab(b.dataset.tab));
  el.panelToggle.addEventListener('click', () => el.panel.classList.toggle('collapsed'));
}

export function showTitle(hasSave) {
  el.title.hidden = false;
  el.game.hidden = true;
  el.btnContinue.hidden = !hasSave;
  el.btnNew.textContent = t('title.new');
  el.btnNew.dataset.confirm = '';
}

/** 새 게임 버튼: 저장이 있으면 한 번 더 눌러야 시작 */
export function armNewGameConfirm() {
  el.btnNew.textContent = t('title.newConfirm');
  el.btnNew.dataset.confirm = '1';
}
export function isNewGameArmed() {
  return el.btnNew.dataset.confirm === '1';
}

export function showGame() {
  el.title.hidden = true;
  el.game.hidden = false;
  lastRendered = { bar: null, clock: null, logLen: -1, logLast: null };
}

export function setView(view) {
  for (const b of el.tabs) b.classList.toggle('active', b.dataset.tab === view);
  el.canvas.hidden = view === 'log';
  el.logView.hidden = view !== 'log';
  el.panel.hidden = view === 'log';
}

export function closePanel() {
  el.panel.classList.add('collapsed');
}

/** 매 프레임 호출. 값이 바뀐 것만 DOM에 쓴다. */
export function renderUI(state) {
  const bar = topBarModel(state);
  const barKey = bar.map((i) => i.text + (i.low ? '!' : '')).join('|');
  if (barKey !== lastRendered.bar) {
    lastRendered.bar = barKey;
    for (const item of bar) {
      const r = el.resEls[item.id];
      r.val.textContent = item.text;
      r.item.classList.toggle('low', item.low);
    }
  }

  const c = clockModel(state);
  const clockKey = [c.dayText, c.timeText, c.phase, c.countdownText, c.paused, c.speed].join('|');
  if (clockKey !== lastRendered.clock) {
    lastRendered.clock = clockKey;
    el.clkDay.textContent = c.dayText;
    el.clkTime.textContent = c.timeText;
    el.clkPhase.textContent = c.phaseText;
    el.clkPhase.dataset.phase = c.phase;
    el.clkCount.textContent = c.countdownText;
    for (const b of el.speedBtns) {
      const v = b.dataset.speed;
      const active = v === 'pause' ? c.paused : !c.paused && Number(v) === c.speed;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    document.body.dataset.phase = c.phase;
  }

  if (!el.logView.hidden) {
    const last = state.log[state.log.length - 1];
    if (state.log.length !== lastRendered.logLen || last !== lastRendered.logLast) {
      lastRendered.logLen = state.log.length;
      lastRendered.logLast = last;
      renderLog(state);
    }
  } else {
    lastRendered.logLen = -1;
  }
}

function renderLog(state) {
  const rows = logModel(state);
  el.logView.innerHTML = '';
  if (rows.length === 0) {
    const p = document.createElement('p');
    p.className = 'log-empty';
    p.textContent = t('log.empty');
    el.logView.appendChild(p);
    return;
  }
  const ul = document.createElement('ul');
  for (const r of rows) {
    const li = document.createElement('li');
    const d = document.createElement('span');
    d.className = 'log-day';
    d.textContent = r.dayText;
    const m = document.createElement('span');
    m.className = 'log-msg';
    m.textContent = r.text;
    li.append(d, m);
    ul.appendChild(li);
  }
  el.logView.appendChild(ul);
}

export function showToast(text) {
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = text;
  el.toasts.appendChild(div);
  setTimeout(() => div.classList.add('out'), (CONFIG.UI.TOAST_SEC - 0.3) * 1000);
  setTimeout(() => div.remove(), CONFIG.UI.TOAST_SEC * 1000);
}

export function setDebug(visible, text) {
  el.debug.hidden = !visible;
  if (visible && text !== undefined) el.debug.textContent = text;
}

export function getCanvas() {
  return el.canvas;
}
