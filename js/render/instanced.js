// 같은 종류 물체를 InstancedMesh 하나로 그린다 (draw call 절약).
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** items: [{ x, y, z, rot, sx, sy, sz }] */
export function makeInstanced(geometry, material, items, { castShadow = true, receiveShadow = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => {
    _p.set(it.x, it.y || 0, it.z);
    _q.setFromAxisAngle(_up, it.rot || 0);
    _s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.computeBoundingSphere();
  return mesh;
}
