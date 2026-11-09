// 해금된 건물 그리기: 상태에 새 건물이 생기면 모델을 만들고 톡 튀어나오게 한다.
import * as THREE from 'three';
import { bakeGroup } from './merge.js';

const C = { stone: 0xb7ae9c, stoneDark: 0x8f8775, wall: 0xe9dfc8, window: 0x2b2a33, green: 0x3d8a46, cream: 0xf3e6c4, roofDark: 0x8a2f22, wood: 0x8a5a34, woodDark: 0x5e3b22, roof: 0xb4432f, straw: 0xd9b36a, target: 0xf3efe2, red: 0xc4342b, cloth: 0x2f5f9e, gold: 0xe0b23c };
const POP_SECONDS = 0.45;

export function createBuildingView(scene, art = { models: {} }) {
  const made = new Map();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const M = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, mat(v)]));

  function part(g, geo, m, x, y, z) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  }

  const builders = {
    barracks(b) {
      const g = new THREE.Group();
      const hw = b.halfWidth, hd = b.halfDepth, w = hw * 2, d = hd * 2;
      part(g, new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2), M.stone, 0, 0.15, 0);          // 돌 받침
      part(g, new THREE.BoxGeometry(w, 1.5, d), M.wall, 0, 1.05, 0);                       // 회벽
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, new THREE.BoxGeometry(0.18, 1.6, 0.18), M.woodDark, sx * (hw - 0.05), 1.05, sz * (hd - 0.05));
      part(g, new THREE.BoxGeometry(w + 0.05, 0.14, d + 0.05), M.woodDark, 0, 1.75, 0);      // 들보
      const roof = part(g, new THREE.CylinderGeometry(d * 0.66, d * 0.66, w + 0.45, 3), M.roof, 0, 2.3, 0);
      roof.rotation.z = Math.PI / 2; roof.rotation.x = Math.PI / 2;
      part(g, new THREE.BoxGeometry(w + 0.5, 0.1, 0.12), M.roofDark, 0, 2.95, 0);           // 용마루
      part(g, new THREE.BoxGeometry(0.7, 1.05, 0.06), M.woodDark, 0, 0.82, hd + 0.03);       // 문
      part(g, new THREE.BoxGeometry(0.8, 0.08, 0.08), M.wood, 0, 1.38, hd + 0.05);
      for (const u of [-1, 1]) part(g, new THREE.BoxGeometry(0.36, 0.36, 0.06), M.window, u * hw * 0.6, 1.15, hd + 0.03);
      // 깃발 (초록 = 궁수)
      part(g, new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5), M.woodDark, -hw + 0.1, 2.4, hd + 0.1);
      part(g, new THREE.BoxGeometry(0.5, 0.34, 0.04), M.green, -hw + 0.36, 2.9, hd + 0.1);
      // 옆에 과녁 + 화살 꽂힌 짚단
      const t = part(g, new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16), M.target, hw + 0.55, 0.85, 0.4);
      t.rotation.x = Math.PI / 2;
      const ring = part(g, new THREE.CylinderGeometry(0.3, 0.3, 0.13, 14), M.red, hw + 0.55, 0.85, 0.4);
      ring.rotation.x = Math.PI / 2;
      const bull = part(g, new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10), M.gold, hw + 0.55, 0.85, 0.4);
      bull.rotation.x = Math.PI / 2;
      part(g, new THREE.BoxGeometry(0.08, 0.9, 0.08), M.woodDark, hw + 0.55, 0.45, 0.32);
      part(g, new THREE.CylinderGeometry(0.28, 0.3, 0.5, 8), M.straw, hw + 0.55, 0.25, -0.5);
      return g;
    },
    tower(b) {
      const g = new THREE.Group();
      const s = b.halfWidth;
      part(g, new THREE.CylinderGeometry(s * 0.95, s * 1.05, 0.6, 10), M.stoneDark, 0, 0.3, 0);   // 받침
      part(g, new THREE.CylinderGeometry(s * 0.78, s * 0.92, 2.5, 10), M.stone, 0, 1.85, 0);       // 돌 몸통
      part(g, new THREE.CylinderGeometry(s * 0.84, s * 0.84, 0.18, 10), M.stoneDark, 0, 1.6, 0);   // 띠
      part(g, new THREE.BoxGeometry(0.12, 0.45, 0.06), M.window, 0, 2.2, s * 0.86);              // 화살 구멍
      part(g, new THREE.BoxGeometry(s * 2.3, 0.25, s * 2.3), M.wood, 0, 3.1, 0);                   // 나무 발판
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        part(g, new THREE.BoxGeometry(0.12, 3.2, 0.12), M.woodDark, sx * s * 1.02, 4.7, sz * s * 1.02);
        part(g, new THREE.BoxGeometry(0.14, 0.6, 0.14), M.woodDark, sx * s * 0.9, 2.75, sz * s * 0.9).rotation.x = sz * 0.5; // 버팀목
      }
      for (const [x, z, w, d] of [[0, s * 1.08, s * 2.3, 0.08], [0, -s * 1.08, s * 2.3, 0.08], [s * 1.08, 0, 0.08, s * 2.3], [-s * 1.08, 0, 0.08, s * 2.3]]) {
        part(g, new THREE.BoxGeometry(w, 0.4, d), M.wood, x, 3.45, z);
        part(g, new THREE.BoxGeometry(w * (w > d ? 1 : 0.1) + 0.04, 0.06, d * (d > w ? 1 : 0.1) + 0.04), M.woodDark, x, 3.67, z);
      }
      // 지붕은 높고 작게 → 위에서 내려다봐도 궁수가 보이도록
      part(g, new THREE.ConeGeometry(s * 1.2, 0.85, 4), M.roof, 0, 6.6, 0).rotation.y = Math.PI / 4;
      part(g, new THREE.BoxGeometry(s * 1.75, 0.08, s * 1.75), M.roofDark, 0, 6.2, 0).rotation.y = 0;
      const flag = new THREE.Group();
      flag.name = 'upgrade';
      part(flag, new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), M.woodDark, 0, 7.4, 0);
      part(flag, new THREE.BoxGeometry(0.7, 0.4, 0.04), M.gold, 0.35, 7.75, 0);
      flag.visible = false;
      g.add(flag);
      return g;
    },
    taxTable(b) {
      const g = new THREE.Group();
      const hw = b.halfWidth, hd = b.halfDepth, w = hw * 2, d = hd * 2;
      part(g, new THREE.BoxGeometry(w, 0.1, d), M.wood, 0, 0.8, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, new THREE.BoxGeometry(0.08, 0.75, 0.08), M.woodDark, sx * (hw - 0.1), 0.38, sz * (hd - 0.1));
      part(g, new THREE.BoxGeometry(w + 0.1, 0.04, 0.32), M.cloth, 0, 0.86, 0);              // 파란 천
      part(g, new THREE.BoxGeometry(w + 0.12, 0.25, 0.04), M.cloth, 0, 0.72, hd + 0.02);     // 앞 늘어진 천
      part(g, new THREE.BoxGeometry(w + 0.14, 0.04, 0.05), M.gold, 0, 0.6, hd + 0.03);
      // 줄무늬 차양 (빨강·크림 번갈아)
      for (const sx of [-1, 1]) part(g, new THREE.BoxGeometry(0.06, 1.75, 0.06), M.woodDark, sx * (hw + 0.05), 0.88, -hd);
      const stripes = 6;
      for (let i = 0; i < stripes; i++) {
        const sw = (w + 0.4) / stripes;
        const st = part(g, new THREE.BoxGeometry(sw, 0.05, 0.95), i % 2 ? M.cream : M.red, -hw - 0.2 + sw * (i + 0.5), 1.72, -hd + 0.32);
        st.rotation.x = 0.25;
      }
      // 금고 상자
      part(g, new THREE.BoxGeometry(0.5, 0.32, 0.32), M.woodDark, -hw - 0.45, 0.16, 0.1);
      part(g, new THREE.BoxGeometry(0.52, 0.06, 0.34), M.gold, -hw - 0.45, 0.33, 0.1);
      return g;
    },
  };

  // 모델이 있는 건물: 모델 + (망루면) 강화 깃발
  function modelBuilding(b) {
    const g = new THREE.Group();
    const md = art.models[b.kind];
    const mesh = new THREE.Mesh(md.geometry, md.material);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (b.kind === 'tower') {
      const top = md.geometry.boundingBox ? md.geometry.boundingBox.max.y : 6;
      const flag = new THREE.Group();
      flag.name = 'upgrade';
      part(flag, new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), M.woodDark, 0, top + 0.6, 0);
      part(flag, new THREE.BoxGeometry(0.7, 0.4, 0.04), M.gold, 0.35, top + 0.95, 0);
      flag.visible = false;
      g.add(flag);
    }
    return g;
  }

  return {
    sync(state, time) {
      for (const b of state.buildings) {
        let v = made.get(b.id);
        if (!v) {
          let g = art.models[b.kind] ? modelBuilding(b) : (builders[b.kind] || builders.barracks)(b);
          if (!art.models[b.kind]) {
            // 강화 깃발(켜졌다 꺼짐)만 빼고 한 덩어리로 굽기
            const flag = g.getObjectByName('upgrade');
            const baked = bakeGroup(g, { skip: m => { let p = m; while (p) { if (p.name === 'upgrade') return true; p = p.parent; } return false; } });
            if (flag) baked.group.add(flag);
            g = baked.group;
          }
          g.position.set(b.x, 0, b.z);
          scene.add(g);
          v = { g, born: time };
          made.set(b.id, v);
        }
        if (b.kind === 'tower') v.g.getObjectByName('upgrade').visible = !!b.upgraded;
        const u = Math.min(1, (time - v.born) / POP_SECONDS);
        // 살짝 넘쳤다가 돌아오는 튀어나오기
        const s = u >= 1 ? 1 : 1 + Math.sin(u * Math.PI) * 0.25 - (1 - u) * (1 - u);
        v.g.scale.setScalar(Math.max(0.01, s));
      }
    },
  };
}
