// 화면에 보이는 한국어 문자열은 전부 여기에.
export const STR = {
  title: 'LASTGATE (가칭)',
  pause: '일시정지',
  resume: '계속하기',
  paused: '일시정지',
  loadError: '게임을 불러오지 못했어요. 새로고침해 주세요.',
  fps: 'FPS',
  coinsLabel: '들고 있는 은화',
  pads: { barracks: '궁수 막사', recruit: '궁수 모집', taxTable: '세금 탁자' },
  wave: (n, total) => `웨이브 ${n}/${total}`,
  nextWave: s => `다음 ${s}초`,
  firstWave: s => `적이 와요 ${s}초`,
  lastWave: '마지막 웨이브',
  waveStart: n => `웨이브 ${n} 시작!`,
  castle: '성채',
  down: s => `쓰러졌어요! ${s}초 뒤 부활`,
  hintMove: '화면을 누르고 끌어서 이동 · PC는 WASD',
};
