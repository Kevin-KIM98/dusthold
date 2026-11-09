// 해금된 건물 그리기: 상태에 새 건물이 생기면 모델을 만들고 톡 튀어나오게 한다.
import * as THREE from 'three';

const C = { stone: 0x9a948a, wood: 0x8a5a34, woodDark: 0x5e3b22, roof: 0xb4432f, straw: 0xd9b36a, target: 0xf3efe2, red: 0xc4342b, cloth: 0x2f5f9e, gold: 0xe0b23c };
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
      const w = b.halfWidth * 2, d = b.halfDepth * 2;
      part(g, new THREE.BoxGeometry(w, 1.6, d), M.wood, 0, 0.8, 0);
      // 박공 지붕 (삼각기둥)
      const roof = part(g, new THREE.CylinderGeometry(d * 0.62, d * 0.62, w + 0.3, 3), M.roof, 0, 2.05, 0);
      roof.rotation.z = Math.PI / 2;
      roof.rotation.x = Math.PI / 2;
      part(g, new THREE.BoxGeometry(0.7, 1.1, 0.06), M.woodDark, 0, 0.55, b.halfDepth + 0.03);
      // 옆에 과녁
      const t = part(g, new THREE.CylinderGeometry(0.45, 0.45, 0.1, 16), M.target, b.halfWidth + 0.5, 0.8, 0.4);
      t.rotation.x = Math.PI / 2;
      const bull = part(g, new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12), M.red, b.halfWidth + 0.5, 0.8, 0.4);
      bull.rotation.x = Math.PI / 2;
      part(g, new THREE.BoxGeometry(0.08, 0.9, 0.08), M.woodDark, b.halfWidth + 0.5, 0.45, 0.32);
      return g;
    },
    tower(b) {
      const g = new THREE.Group();
      const s = b.halfWidth;
      part(g, new THREE.CylinderGeometry(s * 0.8, s * 0.95, 3.0, 8), M.stone, 0, 1.5, 0);
      part(g, new THREE.BoxGeometry(s * 2.2, 0.25, s * 2.2), M.wood, 0, 3.1, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        part(g, new THREE.BoxGeometry(0.1, 3.0, 0.1), M.woodDark, sx * s * 1.0, 4.6, sz * s * 1.0);
      }
      for (const [x, z, w, d] of [[0, s * 1.05, s * 2.2, 0.08], [0, -s * 1.05, s * 2.2, 0.08], [s * 1.05, 0, 0.08, s * 2.2], [-s * 1.05, 0, 0.08, s * 2.2]]) {
        part(g, new THREE.BoxGeometry(w, 0.45, d), M.wood, x, 3.45, z);
      }
      // 지붕은 높고 작게 → 위에서 내려다봐도 궁수가 보이도록
      part(g, new THREE.ConeGeometry(s * 1.15, 0.8, 4), M.roof, 0, 6.5, 0).rotation.y = Math.PI / 4;
      const flag = new THREE.Group();
      flag.name = 'upgrade';
      part(flag, new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), M.woodDark, 0, 7.3, 0);
      part(flag, new THREE.BoxGeometry(0.7, 0.4, 0.04), M.gold, 0.35, 7.65, 0);
      flag.visible = false;
      g.add(flag);
      return g;
    },
    taxTable(b) {
      const g = new THREE.Group();
      const w = b.halfWidth * 2, d = b.halfDepth * 2;
      part(g, new THREE.BoxGeometry(w, 0.1, d), M.wood, 0, 0.8, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, new THREE.BoxGeometry(0.08, 0.75, 0.08), M.woodDark, sx * (b.halfWidth - 0.1), 0.38, sz * (b.halfDepth - 0.1));
      part(g, new THREE.BoxGeometry(w + 0.1, 0.04, 0.3), M.cloth, 0, 0.86, 0);
      // 뒤에 작은 차양
      part(g, new THREE.BoxGeometry(0.06, 1.6, 0.06), M.woodDark, -b.halfWidth, 0.8, -b.halfDepth);
      part(g, new THREE.BoxGeometry(0.06, 1.6, 0.06), M.woodDark, b.halfWidth, 0.8, -b.halfDepth);
      part(g, new THREE.BoxGeometry(w + 0.3, 0.06, 0.8), M.straw, 0, 1.62, -b.halfDepth + 0.25);
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
          const g = art.models[b.kind] ? modelBuilding(b) : (builders[b.kind] || builders.barracks)(b);
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
