// 좀비 도형 (이미지 없이). 일반 = 초록, 돌격형 = 마르고 앞으로 기운 모습, 거구 = 크고 어두움.
// 오리지널 디자인: 팔을 앞으로 뻗은 단순 실루엣 + 빛나는 눈.

const COL = {
  normal: { body: '#5f8a4a', skin: '#8fb878', dark: '#2f4a24' },
  runner: { body: '#7a8a3a', skin: '#b8c070', dark: '#3a4420' },
  brute: { body: '#4a5a3a', skin: '#748a5c', dark: '#222c1a' },
  eye: '#ffe066',
};
const SIZE = { normal: 1, runner: 0.9, brute: 1.6 };

/**
 * 발 위치 (x, y) 기준. k = 크기 배율(줌), face = 1 오른쪽 / -1 왼쪽, t = 애니메이션 시간(ms)
 * hpRatio < 1이면 머리 위 체력 막대
 */
export function drawZombie(ctx, x, y, k, type, face, t, hpRatio) {
  const c = COL[type] || COL.normal;
  const s = k * (SIZE[type] || 1);
  const lean = type === 'runner' ? 4 * s * face : 0;
  const step = Math.sin(t / (type === 'runner' ? 90 : 180)) * 2 * s;
  ctx.fillStyle = c.dark;
  ctx.fillRect(x - 4 * s, y - 6 * s, 3 * s, 6 * s + step * 0.3);     // 다리
  ctx.fillRect(x + 1 * s, y - 6 * s, 3 * s, 6 * s - step * 0.3);
  ctx.fillStyle = c.body;
  ctx.beginPath();                                                    // 몸 (기울어진 사다리꼴)
  ctx.moveTo(x - 5 * s, y - 6 * s);
  ctx.lineTo(x + 5 * s, y - 6 * s);
  ctx.lineTo(x + 4 * s + lean, y - 17 * s);
  ctx.lineTo(x - 4 * s + lean, y - 17 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.skin;                                             // 앞으로 뻗은 팔
  ctx.fillRect(x + lean + (face > 0 ? 2 : -10) * s, y - 15 * s + step * 0.4, 8 * s, 2.5 * s);
  ctx.beginPath();                                                    // 머리
  ctx.arc(x + lean + face * s, y - 20 * s, 4 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COL.eye;
  ctx.fillRect(x + lean + face * 2.5 * s - 1 * s, y - 21 * s, 2 * s, 1.5 * s);
  if (hpRatio !== undefined && hpRatio < 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 6 * s, y - 28 * s, 12 * s, 2 * s);
    ctx.fillStyle = '#e0504a';
    ctx.fillRect(x - 6 * s, y - 28 * s, 12 * s * Math.max(0, hpRatio), 2 * s);
  }
}
