// M6 아트: 아틀라스 파일 검사 (plan.md M6 아트 목록, 성능 상한 "아틀라스 PNG 장당 2048px 이하", CLAUDE.md 지식재산 규칙)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATLAS } from '../assets/atlas.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** PNG 헤더에서 크기 읽기 */
function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${file}는 PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test('아틀라스 이미지: 모두 있고 PNG, 장당 2048px 이하', () => {
  const keys = Object.keys(ATLAS.images);
  assert.ok(keys.length >= 6);
  for (const k of keys) {
    const file = path.join(ROOT, ATLAS.images[k]);
    assert.ok(fs.existsSync(file), file + ' 없음');
    const { w, h } = pngSize(file);
    assert.ok(w <= 2048 && h <= 2048, `${k}: ${w}x${h}`);
  }
});

test('스프라이트 칸이 모두 이미지 안에 있다', () => {
  for (const [name, sp] of Object.entries(ATLAS.sprites)) {
    const { w, h } = pngSize(path.join(ROOT, ATLAS.images[sp.img]));
    assert.ok(sp.w > 0 && sp.h > 0, name);
    assert.ok(sp.x >= 0 && sp.y >= 0 && sp.x + sp.w <= w && sp.y + sp.h <= h, `${name} 범위 밖`);
  }
});

test('기획서 M6 아트 목록이 모두 들어 있다', () => {
  const need = [
    // 지상 타일 8종 + 안개 + 입구
    'tile.forest', 'tile.ruins', 'tile.farm', 'tile.reservoir', 'tile.box', 'tile.camp', 'tile.nest', 'tile.base', 'tile.fog', 'tile.entrance',
    // 벙커 방 내부 11종 (샤프트·발전·정수·재배·숙소·창고·작업장·경비·의무·무선·포탑), 흙·바위 칸, 지표면 띠
    'room.shaft', 'room.generator', 'room.water', 'room.farm', 'room.quarters', 'room.storage', 'room.workshop', 'room.guard', 'room.medbay', 'room.radio', 'turret',
    'soil.top', 'soil.deep', 'cell.cave', 'ground.strip',
    // 공사 오버레이(비계·골조), 크레인
    'scaffold', 'frame', 'crane',
    // 생존자 4종 × 2프레임, 좀비 3종
    'surv.gather.0', 'surv.gather.1', 'surv.build.0', 'surv.build.1', 'surv.combat.0', 'surv.combat.1', 'surv.tech.0', 'surv.tech.1',
    'zombie.normal', 'zombie.runner', 'zombie.brute',
    // 아이콘: 자원 6종 + 인구, 번개(전력 끊김), 부상
    'icon.food', 'icon.water', 'icon.wood', 'icon.scrap', 'icon.power', 'icon.parts', 'icon.pop', 'icon.powerOff', 'icon.injured',
  ];
  const missing = need.filter((n) => !ATLAS.sprites[n]);
  assert.deepEqual(missing, []);
});

test('지식재산: 파일 이름·스프라이트 이름에 원작 이름이 없다', () => {
  const banned = /tiles\s*survive|funplus|sarge/i;
  const names = [...Object.keys(ATLAS.sprites), ...Object.values(ATLAS.images), ...fs.readdirSync(path.join(ROOT, 'assets'))];
  for (const n of names) assert.ok(!banned.test(n), n);
});

test('화면 다듬기 6·7·8: 타이틀 그림(JPEG), 진행바·체력바·배지, 이음새 없는 안개', () => {
  for (const n of ['ui.barTrack', 'ui.barFill', 'ui.barGreen', 'ui.barYellow', 'ui.barRed', 'ui.badge', 'fog.seamless']) assert.ok(ATLAS.sprites[n], n);
  for (const n of ['ui.barTrack', 'ui.barFill', 'ui.barGreen', 'ui.barYellow', 'ui.barRed']) {
    const sp = ATLAS.sprites[n];
    assert.ok(sp.w > sp.h * 4, `${n}: 가로로 긴 막대 (${sp.w}x${sp.h})`);
  }
  const fog = ATLAS.sprites['fog.seamless'];
  assert.equal(fog.w, fog.h, '안개는 정사각형');
  const jpg = fs.readFileSync(path.join(ROOT, 'assets/title.jpg'));
  assert.equal(jpg.readUInt16BE(0), 0xffd8, 'JPEG');
  assert.ok(jpg.length < 400 * 1024, `타이틀 그림 ${Math.round(jpg.length / 1024)}KB`);
});
