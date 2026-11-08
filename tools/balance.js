// 밸런스 확인: 자동 플레이어로 여러 시드를 끝까지 돌려 결과를 표로 보여준다.
//   node tools/balance.js [시드 수=20] [최대 일수=20]
import { playGame } from './bot.js';

const seeds = Number(process.argv[2]) || 20;
const maxDays = Number(process.argv[3]) || 20;
const rows = [];
for (let k = 1; k <= seeds; k++) rows.push(playGame(1000 + k, maxDays));

const won = rows.filter((r) => r.outcome === 'victory');
const lost = rows.filter((r) => r.outcome === 'defeat');
const days = won.map((r) => r.day).sort((a, b) => a - b);
const median = days.length ? days[Math.floor(days.length / 2)] : '-';
console.log('시드  결과      일차  생존  문파괴(첫날)  처치  방');
for (const r of rows) {
  console.log(`${String(r.seed).padEnd(5)} ${r.outcome.padEnd(9)} ${String(r.day).padStart(3)}  ${String(r.survivors).padStart(4)}  ${String(r.breaches).padStart(4)}(${r.firstBreachDay || '-'})      ${String(r.killed).padStart(4)}  ${r.rooms}`);
}
console.log(`\n클리어 ${won.length}/${rows.length} · 전멸 ${lost.length} · 시간초과 ${rows.length - won.length - lost.length} · 클리어 일차 중앙값 ${median} (범위 ${days[0] || '-'}~${days[days.length - 1] || '-'})`);
console.log(`1일차 밤 문 파괴 ${rows.filter((r) => r.firstBreachDay === 1).length}/${rows.length}`);
