// 효과음: 파일 없이 Web Audio로 합성. sim 이벤트를 읽어 소리만 낸다 (게임 규칙과 무관).
// 브라우저 정책상 첫 터치/키 입력 뒤에 소리가 켜진다.
const MUTE_KEY = 'lastgate.muted';

export function createSound(cfg) {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* 저장소 없음 */ }
  const last = {};          // 종류별 마지막 재생 시각 (너무 잦은 소리 막기)
  const played = {};        // 테스트용 집계
  let pickupStreak = 0, pickupAt = 0;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : cfg.volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; // 연출용 잡음
  }
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, ensure, { capture: true });

  // ── 소리 재료 ──
  function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, { freq = 1200, vol = 0.3, delay = 0 } = {}) {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t); src.stop(t + dur);
  }

  const SFX = {
    pickup() {
      const now = ctx.currentTime;
      pickupStreak = now - pickupAt < 0.4 ? Math.min(pickupStreak + 1, 12) : 0;
      pickupAt = now;
      tone(880 * Math.pow(1.04, pickupStreak), 0.07, { type: 'triangle', vol: 0.18, slide: 1.5 });
    },
    pay() { tone(620, 0.04, { type: 'square', vol: 0.06, slide: 0.8 }); },
    unlock() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.22, delay: i * 0.07 })); },
    hit() { noise(0.07, { freq: 1800, vol: 0.18 }); },
    slash() { noise(0.12, { freq: 3200, vol: 0.22 }); tone(240, 0.1, { type: 'triangle', vol: 0.15, slide: 0.5, delay: 0.05 }); },
    hurt() { noise(0.12, { freq: 500, vol: 0.3 }); tone(160, 0.12, { type: 'sine', vol: 0.2, slide: 0.6 }); },
    wave() { tone(196, 0.35, { type: 'sawtooth', vol: 0.12 }); tone(262, 0.55, { type: 'sawtooth', vol: 0.12, delay: 0.3 }); },
    down() { tone(330, 0.09, { type: 'square', vol: 0.06, slide: 0.5 }); },
    wall() { noise(0.35, { freq: 400, vol: 0.4 }); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.22, delay: i * 0.12 })); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, { type: 'sawtooth', vol: 0.1, delay: i * 0.18 })); },
  };
  const GAP = { pickup: 0.035, pay: 0.06, hit: 0.05, hurt: 0.12, down: 0.06, slash: 0.1 };

  function play(name) {
    played[name] = (played[name] || 0) + 1;
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    if (GAP[name] && last[name] !== undefined && now - last[name] < GAP[name]) return;
    last[name] = now;
    SFX[name]();
  }

  return {
    /** 이번 프레임의 sim 이벤트 → 효과음 */
    events(list) {
      for (const e of list) {
        switch (e.type) {
          case 'pickup': case 'taxCollect': play('pickup'); break;
          case 'pay': play('pay'); break;
          case 'unlock': case 'towerUpgrade': play('unlock'); break;
          case 'hit': play(e.target === 'enemy' || e.target === 'wall' ? 'hit' : 'hurt'); break;
          case 'waveStart': play('wave'); break;
          case 'slash': play('slash'); break;
          case 'enemyDown': play('down'); break;
          case 'wallDown': play('wall'); break;
          case 'gameOver': play(e.result === 'win' ? 'win' : 'lose'); break;
        }
      }
    },
    isMuted: () => muted,
    setMuted(m) {
      muted = m;
      try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* 저장소 없음 */ }
      if (master) master.gain.value = m ? 0 : cfg.volume;
    },
    stats: () => ({ ...played, ready: !!ctx }),
  };
}
