// 적 기지 그리기: 어두운 목책 울타리 + 가운데 막사 + 붉은 깃발. 점령하면 무너진 모습 + 파란 깃발.
// 스테이지마다 기지가 새로 생기므로 id로 만들고 지운다.
import * as THREE from 'three';
import { bakeGroup } from './merge.js';

const C = { post: 0x3b2a22, postTip: 0x2a1d17, hut: 0x4a3328, roof: 0x7a1f22, banner: 0xc0262b, pole: 0x2a1d17, ground: 0x5b4a3a, ruin: 0x4a4038, blue: 0x3f86d8 };

function part(g, geo, color, x, y, z) {
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

function liveCamp(h) {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(h * 1.15, h * 1.25, 0.12, 14), C.ground, 0, 0.06, 0);
  const n = 14;
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === 1) continue; // 앞쪽 입구
    const a = (i / n) * Math.PI * 2 + Math.PI / 2;
    const r = h * 1.05, hh = 1.6 + (i % 3) * 0.15;
    part(g, new THREE.CylinderGeometry(0.16, 0.18, hh, 5), C.post, Math.cos(a) * r, hh / 2, Math.sin(a) * r);
    part(g, new THREE.ConeGeometry(0.17, 0.35, 5), C.postTip, Math.cos(a) * r, hh + 0.17, Math.sin(a) * r);
  }
  part(g, new THREE.BoxGeometry(1.8, 1.4, 1.6), C.hut, 0, 0.7, -0.2);
  part(g, new THREE.ConeGeometry(1.45, 1.2, 4), C.roof, 0, 2.0, -0.2).rotation.y = Math.PI / 4;
  part(g, new THREE.BoxGeometry(0.6, 0.9, 0.06), C.pole, 0, 0.45, 0.62);
  for (const sx of [-1, 1]) {
    part(g, new THREE.CylinderGeometry(0.05, 0.05, 2.8, 5), C.pole, sx * 1.4, 1.4, 1.2);
    part(g, new THREE.BoxGeometry(0.06, 0.9, 0.55), C.banner, sx * 1.4, 2.3, 1.48);
  }
  return g;
}

function ruinCamp(h) {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(h * 1.15, h * 1.25, 0.12, 14), C.ground, 0, 0.06, 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const m = part(g, new THREE.BoxGeometry(0.3, 0.3, 1.0), C.ruin, Math.cos(a) * h * 0.9, 0.15, Math.sin(a) * h * 0.9);
    m.rotation.y = a * 1.7;
  }
  part(g, new THREE.BoxGeometry(1.6, 0.5, 1.4), C.ruin, 0, 0.25, -0.2);
  part(g, new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), C.pole, 0, 1.3, 0);
  part(g, new THREE.BoxGeometry(0.9, 0.55, 0.05), C.blue, 0.45, 2.3, 0); // 우리 깃발
  return g;
}

export function createCampView(scene) {
  const made = new Map();
  return {
    sync(state) {
      const ids = new Set(state.camps.map(c => c.id));
      for (const [id, v] of made) if (!ids.has(id)) { scene.remove(v.root); made.delete(id); }
      for (const c of state.camps) {
        let v = made.get(c.id);
        if (!v) {
          const root = new THREE.Group();
          root.position.set(c.x, 0, c.z);
          // 입구가 길(성채 쪽)을 보도록
          root.rotation.y = Math.atan2(c.sx - c.x, c.sz - c.z);
          const live = bakeGroup(liveCamp(c.halfWidth)).group;
          const ruin = bakeGroup(ruinCamp(c.halfWidth)).group;
          root.add(live, ruin);
          scene.add(root);
          v = { root, live, ruin };
          made.set(c.id, v);
        }
        v.live.visible = !c.captured;
        v.ruin.visible = c.captured;
      }
    },
  };
}
