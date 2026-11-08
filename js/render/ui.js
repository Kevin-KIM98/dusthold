// 상단 바·시계·배속·탭·패널·토스트·기록. DOM은 여기와 main.js, input.js만 만진다.

import { CONFIG } from '../config.js';
import { drawTitleScene } from './titleScene.js';
import { t } from '../strings.js';
import { topBarModel, clockModel, logModel, panelKey } from './viewModel.js';
import { spriteCss } from './sprites.js';

const el = {};
let lastRendered = { bar: null, clock: null, logLen: -1, logLast: null };
let lastPanelKey = null;

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
  document.getElementById('ms-head').addEventListener('click', () => handlers.onToggleMissions());
  const skip = document.getElementById('gd-skip');
  skip.textContent = t('guide.skip');
  skip.addEventListener('click', () => handlers.onSkipGuide());

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
  // 패널 안 버튼은 data-action / data-arg 로 위임
  el.panelBody.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]');
    if (!b || b.disabled) return;
    const raw = b.dataset.arg;
    const arg = raw === undefined ? undefined : (/^-?\d+$/.test(raw) ? Number(raw) : raw);
    handlers.onPanelAction(b.dataset.action, arg);
  });
}

export function openPanel() {
  el.panel.classList.remove('collapsed');
}

function mkButton(btn, cls) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn ' + (cls || '') + (btn.primary ? ' primary' : '');
  b.dataset.action = btn.action;
  if (btn.arg !== undefined) b.dataset.arg = String(btn.arg);
  b.textContent = btn.label;
  if (btn.enabled === false) b.disabled = true;
  return b;
}

function mkText(tag, cls, text) {
  const n = document.createElement(tag);
  n.className = cls;
  n.textContent = text;
  return n;
}

/** 선택 패널. model이 null이면 "선택한 대상이 없습니다". 바뀐 경우에만 DOM을 다시 만든다. */
export function renderPanel(model) {
  const key = panelKey(model);
  if (key === lastPanelKey) return;
  lastPanelKey = key;
  const body = el.panelBody;
  body.innerHTML = '';
  if (!model) {
    document.getElementById('panel-title').textContent = t('panel.title');
    body.appendChild(mkText('p', 'pn-line', t('panel.none')));
    return;
  }
  const title = document.getElementById('panel-title');
  title.textContent = model.title + (model.sub ? ' · ' + model.sub : '');
  for (const line of model.lines) body.appendChild(mkText('p', 'pn-line', line));

  if (model.actions.length > 0 && !model.picker) {
    const row = document.createElement('div');
    row.className = 'pn-actions';
    for (const a of model.actions) {
      row.appendChild(mkButton(a));
      if (!a.enabled && a.reason) row.appendChild(mkText('span', 'pn-reason', a.reason));
    }
    body.appendChild(row);
  }
  if (model.menu && !model.picker) {
    const box = document.createElement('div');
    box.className = 'menu';
    box.appendChild(mkText('p', 'pk-title', model.menu.title));
    for (const it of model.menu.items) {
      const b = mkButton({ action: it.action, arg: it.arg, label: '', enabled: it.enabled }, 'menu-row');
      b.appendChild(mkText('span', 'menu-label', it.label));
      b.appendChild(mkText('span', it.enabled ? 'menu-sub' : 'menu-sub pn-reason', it.sub));
      box.appendChild(b);
    }
    body.appendChild(box);
  }
  if (model.list.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'pn-list';
    for (const it of model.list) {
      const li = document.createElement('li');
      li.appendChild(mkText('span', 'pn-item', it.text));
      li.appendChild(mkButton({ action: it.action, arg: it.arg, label: it.label, enabled: true }, 'sm'));
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }
  if (model.picker) {
    const pk = model.picker;
    const box = document.createElement('div');
    box.className = 'picker';
    box.appendChild(mkText('p', 'pk-title', pk.title));
    if (pk.empty) box.appendChild(mkText('p', 'pn-reason', pk.empty));
    if (pk.summary) box.appendChild(mkText('p', 'pk-summary', pk.summary));
    if (pk.warn) box.appendChild(mkText('p', 'pn-reason', pk.warn));
    for (const r of pk.rows) {
      const b = mkButton({ action: r.action, arg: r.arg, label: r.text, enabled: true }, 'pk-row' + (r.selected ? ' selected' : ''));
      b.setAttribute('aria-pressed', r.selected ? 'true' : 'false');
      box.appendChild(b);
    }
    const btns = document.createElement('div');
    btns.className = 'pn-actions';
    if (pk.depart) btns.appendChild(mkButton({ ...pk.depart, primary: true }));
    btns.appendChild(mkButton({ action: 'cancel', label: t('action.cancel'), enabled: true }));
    if (pk.depart && !pk.depart.enabled && pk.depart.reason) btns.appendChild(mkText('span', 'pn-reason', pk.depart.reason));
    box.appendChild(btns);
    body.appendChild(box);
  }
}

/** 상단 바 자원 아이콘을 이미지로 (M6). 이미지가 없으면 CSS 도형 그대로 */
export function applyIconSprites() {
  for (const id of Object.keys(el.resEls || {})) {
    const ico = el.resEls[id].item.querySelector('.ico');
    const css = spriteCss('icon.' + id, CONFIG.UI.ICON_PX);
    if (!ico || !css) continue;
    ico.classList.add('ico-img');
    Object.assign(ico.style, css);
  }
}

// ---------- 1일차 가이드 ----------
let lastGuideKey = null;

/** model = tutorialModel() 결과 또는 null. view = 지금 화면 */
export function renderGuide(model, view) {
  const box = document.getElementById('guide');
  const stage = document.getElementById('stage');
  const key = model ? model.title + model.body + model.extra + (model.target ? model.target.view : '') + view : '';
  if (key === lastGuideKey) return;
  lastGuideKey = key;
  for (const b of el.tabs) b.classList.remove('pulse');
  if (!model || view === 'log') {
    box.hidden = true;
    stage.classList.remove('has-guide');
    if (model && model.target) pulseTab(model.target.view, view);
    return;
  }
  box.hidden = false;
  stage.classList.add('has-guide');
  document.getElementById('gd-title').textContent = model.title;
  document.getElementById('gd-body').textContent = model.body;
  document.getElementById('gd-extra').textContent = model.extra || '';
  if (model.target) pulseTab(model.target.view, view);
}

function pulseTab(want, view) {
  if (want === view) return;
  for (const b of el.tabs) if (b.dataset.tab === want) b.classList.add('pulse');
}

// ---------- 일차별 미션 카드 ----------
let lastMissionKey = null;

/** model = missionModel() 결과 또는 null. collapsed = 접힘 */
export function renderMissions(model, view, collapsed) {
  const box = document.getElementById('missions');
  const stage = document.getElementById('stage');
  const key = model ? JSON.stringify(model) + view + collapsed : 'none' + view;
  if (key === lastMissionKey) return;
  lastMissionKey = key;
  const show = !!model && view !== 'log';
  box.hidden = !show;
  stage.classList.toggle('has-missions', show);
  stage.classList.toggle('has-missions-open', show && !collapsed);
  if (!show) return;
  box.classList.toggle('collapsed', collapsed);
  box.classList.toggle('danger', !model.allMust);
  document.getElementById('ms-head').setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  document.getElementById('ms-title').textContent = model.title;
  document.getElementById('ms-summary').textContent = model.summary;
  const body = document.getElementById('ms-body');
  body.innerHTML = '';
  if (model.note) body.appendChild(mkText('p', 'ms-note', model.note));
  const item = (it) => {
    const row = document.createElement('p');
    row.className = 'ms-item' + (it.done ? ' done' : '');
    row.appendChild(mkText('span', 'ms-mark', it.done ? '✓' : '!'));
    row.appendChild(mkText('span', 'ms-text', it.text));
    return row;
  };
  // 아직 안 한 것만 한 줄씩, 끝난 것은 맨 아래 한 줄로 모은다 (카드를 얇게)
  const mustLeft = model.must.filter((it) => !it.done);
  const goalsLeft = model.goals.filter((it) => !it.done);
  const done = [...model.must, ...model.goals].filter((it) => it.done);
  if (mustLeft.length) {
    body.appendChild(mkText('p', 'ms-sec', t('mission.must')));
    for (const it of mustLeft) body.appendChild(item(it));
    if (model.how) body.appendChild(mkText('p', 'ms-how', model.how));
  } else {
    body.appendChild(mkText('p', 'ms-safe', '✓ ' + t('mission.allSafe')));
  }
  if (goalsLeft.length) {
    body.appendChild(mkText('p', 'ms-sec', t('mission.goals')));
    for (const it of goalsLeft) {
      const row = item(it);
      row.querySelector('.ms-mark').textContent = '○';
      body.appendChild(row);
    }
  }
  if (done.length) {
    const row = mkText('p', 'ms-done', '✓ ' + t('mission.doneLine', { list: done.map((it) => it.text).join(' · ') }));
    row.title = row.textContent;
    body.appendChild(row);
  }
  // 알림이 카드에 가리지 않게 카드 높이를 무대에 알려 준다
  stage.style.setProperty('--ms-h', box.offsetHeight + 'px');
}

/** 패널 안에서 selectors에 맞는 버튼만 반짝인다 */
export function pulsePanelButtons(selectors) {
  const all = el.panelBody.querySelectorAll('button.pulse');
  for (const b of all) b.classList.remove('pulse');
  for (const sel of selectors) for (const b of el.panelBody.querySelectorAll(sel)) if (!b.disabled) b.classList.add('pulse');
}

export function showTitle(hasSave) {
  el.title.hidden = false;
  drawTitleArt();
  el.game.hidden = true;
  el.btnContinue.hidden = !hasSave;
  el.btnNew.textContent = t('title.new');
  el.btnNew.dataset.confirm = '';
}

/** 타이틀 배경 장면 (보일 때만). 크기가 바뀌거나 그림을 불러오면 다시 */
export function drawTitleArt() {
  if (el.title.hidden) return;
  drawTitleScene(document.getElementById('title-art'));
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

export function isPanelOpen() {
  return !el.panel.classList.contains('collapsed') && !el.panel.hidden;
}

export function showToast(text) {
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = text;
  el.toasts.appendChild(div);
  while (el.toasts.children.length > CONFIG.UI.TOAST_MAX) el.toasts.firstChild.remove();
  setTimeout(() => div.classList.add('out'), (CONFIG.UI.TOAST_SEC - 0.3) * 1000);
  setTimeout(() => div.remove(), CONFIG.UI.TOAST_SEC * 1000);
}

export function setDebug(visible, text) {
  el.debug.hidden = !visible;
  if (visible && text !== undefined) el.debug.textContent = text;
}

// ---------- 결과·힌트 카드 ----------
let overlayHandler = null;

/**
 * spec = { variant: 'result'|'hint', title, sub, stats: [[라벨, 값]], buttons: [{ id, label, primary }] }
 * onButton(id) 는 버튼을 누르면 불린다.
 */
export function showOverlay(spec, onButton) {
  const ov = document.getElementById('overlay');
  ov.className = spec.variant === 'hint' ? 'hint' : '';
  document.getElementById('ov-title').textContent = spec.title;
  document.getElementById('ov-sub').textContent = spec.sub || '';
  const dl = document.getElementById('ov-stats');
  dl.innerHTML = '';
  for (const [k, v] of spec.stats || []) {
    dl.appendChild(mkText('dt', '', k));
    dl.appendChild(mkText('dd', '', v));
  }
  const box = document.getElementById('ov-buttons');
  box.innerHTML = '';
  for (const b of spec.buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn' + (b.primary ? ' primary' : '');
    btn.dataset.ov = b.id;
    btn.textContent = b.label;
    box.appendChild(btn);
  }
  overlayHandler = onButton;
  ov.hidden = false;
}

export function hideOverlay() {
  document.getElementById('overlay').hidden = true;
  overlayHandler = null;
}

export function isOverlayOpen() {
  return !document.getElementById('overlay').hidden;
}

export function initOverlay() {
  document.getElementById('ov-buttons').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ov]');
    if (b && overlayHandler) overlayHandler(b.dataset.ov);
  });
}

export function getCanvas() {
  return el.canvas;
}
