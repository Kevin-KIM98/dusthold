// 성벽 그리기: 목책(통나무 기둥 + 가로대) / 돌벽(돌 블록 + 총안), 성문은 어두운 나무 문.
// 상태의 성벽 구성이 바뀔 때만 인스턴스를 다시 채운다.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const POST_GAP = 0.36, POST_H = 2.0, MERLON_GAP = 0.9, STONE_H = 2.4;

export function createWallView(scene, balance) {
  const max = balance.render.maxWallPosts;
  const mk = (geo, color, n, flat = false) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: flat }), n);
    m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0); // 바닥 기준 상자
  const posts = mk(new THREE.CylinderGeometry(0.15, 0.17, POST_H, 6).translate(0, POST_H / 2, 0), 0x8a5a34, max);
  const tips = mk(new THREE.ConeGeometry(0.16, 0.35, 6).translate(0, POST_H + 0.17, 0), 0x6b4a2f, max);
  const beams = mk(unit, 0x6b4a2f, 120);
  const doors = mk(unit, 0x4a3524, 40);
  const stone = mk(unit, 0xa9a397, 60, true);
  const merlons = mk(unit, 0x958f84, max, true);
  let sig = '';

  function fill(state) {
    const counts = { posts: 0, beams: 0, doors: 0, stone: 0, merlons: 0 };
    const put = (mesh, key, x, y, z, sx, sy, sz) => {
      if (counts[key] >= mesh.instanceMatrix.count) return;
      _p.set(x, y, z); _s.set(sx, sy, sz);
      mesh.setMatrixAt(counts[key]++, _m.compose(_p, _q.identity(), _s));
    };
    const stoneLvl = state.wallLevel >= 2;
    for (const w of state.walls) {
      const alongX = w.halfWidth >= w.halfDepth;
      const len = (alongX ? w.halfWidth : w.halfDepth) * 2;
      const th = (alongX ? w.halfDepth : w.halfWidth) * 2;
      if (w.gate) {
        // 문틀 기둥 2개 + 문짝 + 위 가로대
        const ex = alongX ? w.halfWidth : 0, ez = alongX ? 0 : w.halfDepth;
        put(stoneLvl ? stone : beams, stoneLvl ? 'stone' : 'beams', w.x - ex, 0, w.z - ez, 0.5, 2.8, 0.5);
        put(stoneLvl ? stone : beams, stoneLvl ? 'stone' : 'beams', w.x + ex, 0, w.z + ez, 0.5, 2.8, 0.5);
        put(doors, 'doors', w.x, 0, w.z, alongX ? len - 0.4 : th * 0.6, 2.1, alongX ? th * 0.6 : len - 0.4);
        put(doors, 'doors', w.x, 2.4, w.z, alongX ? len + 0.4 : th * 0.9, 0.3, alongX ? th * 0.9 : len + 0.4);
        continue;
      }
      if (stoneLvl) {
        put(stone, 'stone', w.x, 0, w.z, w.halfWidth * 2, STONE_H, w.halfDepth * 2);
        const n = Math.max(1, Math.floor(len / MERLON_GAP));
        for (let i = 0; i < n; i++) {
          const u = -len / 2 + (i + 0.5) * (len / n);
          put(merlons, 'merlons', w.x + (alongX ? u : 0), STONE_H, w.z + (alongX ? 0 : u), alongX ? 0.45 : th, 0.4, alongX ? th : 0.45);
        }
      } else {
        const n = Math.max(1, Math.round(len / POST_GAP));
        for (let i = 0; i < n; i++) {
          const u = -len / 2 + (i + 0.5) * (len / n);
          const x = w.x + (alongX ? u : 0), z = w.z + (alongX ? 0 : u);
          const h = 0.9 + ((i * 7) % 3) * 0.06; // 높이 살짝 들쭉날쭉
          if (counts.posts < max) {
            _p.set(x, 0, z); _s.set(1, h, 1);
            posts.setMatrixAt(counts.posts, _m.compose(_p, _q.identity(), _s));
            _p.set(x, (h - 1) * POST_H, z); _s.set(1, 1, 1);
            tips.setMatrixAt(counts.posts, _m.compose(_p, _q, _s));
            counts.posts++;
          }
        }
        for (const y of [0.6, 1.4]) put(beams, 'beams', w.x, y, w.z, alongX ? len : 0.12, 0.14, alongX ? 0.12 : len);
      }
    }
    posts.count = tips.count = counts.posts;
    beams.count = counts.beams; doors.count = counts.doors; stone.count = counts.stone; merlons.count = counts.merlons;
    for (const m of [posts, tips, beams, doors, stone, merlons]) m.instanceMatrix.needsUpdate = true;
  }

  return {
    sync(state) {
      const s = state.wallLevel + ':' + state.walls.map(w => w.id).join(',');
      if (s !== sig) { sig = s; fill(state); }
    },
  };
}
