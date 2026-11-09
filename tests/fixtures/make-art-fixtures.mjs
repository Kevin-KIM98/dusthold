// 테스트용 가짜 아트 만들기 (크레딧 없이 M6 불러오기·대체 동작을 확인하려고). 실행: node tests/fixtures/make-art-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BoxGeometry, SphereGeometry, ConeGeometry } from '../../vendor/three/three.core.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'art');

/** three 지오메트리 하나 → 최소 GLB (재질 = 단색) */
function glb(geo, rgba) {
  const g = geo.index ? geo : geo;
  const pos = g.attributes.position.array, nor = g.attributes.normal.array, uv = g.attributes.uv.array;
  const idx = new Uint32Array(g.index.array);
  const parts = [new Float32Array(pos), new Float32Array(nor), new Float32Array(uv), idx];
  const views = []; let off = 0;
  for (const p of parts) { views.push({ buffer: 0, byteOffset: off, byteLength: p.byteLength }); off += p.byteLength; }
  const bin = Buffer.concat(parts.map(p => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
  const n = pos.length / 3;
  const json = {
    asset: { version: '2.0', generator: 'lastgate-test' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: rgba, metallicFactor: 0, roughnessFactor: 1 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: views,
    accessors: [
      { bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: n, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: n, type: 'VEC2' },
      { bufferView: 3, componentType: 5125, count: idx.length, type: 'SCALAR' },
    ],
  };
  const pad = (b, c) => Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4, c)]);
  const jb = pad(Buffer.from(JSON.stringify(json)), 0x20), bb = pad(bin, 0);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jb.length + 8 + bb.length, 8);
  const ch = (b, t) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.writeUInt32LE(t, 4); return Buffer.concat([h, b]); };
  return Buffer.concat([head, ch(jb, 0x4e4f534a), ch(bb, 0x004e4942)]);
}

/** 8×8 체크무늬 PNG */
function png() {
  const w = 8, h = 8, raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (1 + w * 3) + 1 + x * 3, on = (x + y) % 2;
      raw[o] = on ? 120 : 90; raw[o + 1] = on ? 170 : 140; raw[o + 2] = on ? 80 : 60;
    }
  }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync(join(OUT, 'box.glb'), glb(new BoxGeometry(1, 2, 1), [0.9, 0.2, 0.6, 1]));      // 12 삼각형
writeFileSync(join(OUT, 'cone.glb'), glb(new ConeGeometry(1, 2, 8), [0.2, 0.5, 0.2, 1]));
writeFileSync(join(OUT, 'heavy.glb'), glb(new SphereGeometry(1, 64, 48), [1, 1, 1, 1]));     // 약 6천 삼각형 → 상한 초과
writeFileSync(join(OUT, 'grass.png'), png());
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  models: {
    raider: { file: 'box.glb' },          // 사용됨
    tree: { file: 'cone.glb' },           // 사용됨
    castle: { file: 'box.glb' },          // 사용됨 (폭에 맞춤)
    archer: { file: 'heavy.glb' },        // 상한 초과 → 도형
    giant: { file: 'missing.glb' },       // 파일 없음 → 도형
  },
  textures: { grass: { file: 'grass.png', repeat: 1 } },
}, null, 2));
console.log('ok');
