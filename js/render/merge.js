// 여러 도형 부위를 "색이 칠해진 한 덩어리"로 굽는다 → 물체 하나 = draw call 1번.
// 색은 꼭짓점 색(vertex color)으로 넣고, 재질은 모두 공유한다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let sharedMat = null, sharedFlat = null;
/** 꼭짓점 색 재질 (공유) */
export function vcMaterial(flat = false) {
  if (flat) return sharedFlat || (sharedFlat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  return sharedMat || (sharedMat = new THREE.MeshLambertMaterial({ vertexColors: true }));
}

const _c = new THREE.Color();
function paint(geo, color, flat) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (flat || !g.attributes.normal) g.computeVertexNormals();
  _c.set(color);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** parts: [{ geo, color, flat }] (위치는 지오메트리에 이미 구워져 있음) → 지오메트리 하나 */
export function bakeParts(parts) {
  return mergeGeometries(parts.map(p => paint(p.geo, p.color, p.flat)), false);
}

/** 그룹 안 모든 메시(재질 색 사용)를 그룹 기준 좌표로 합친 메시 하나. skip(mesh)=true면 빼고 그대로 둠 */
export function bakeGroup(group, { skip = () => false, castShadow = true, receiveShadow = true } = {}) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts = [], keep = [];
  group.traverse(o => {
    if (!o.isMesh) return;
    if (skip(o)) { keep.push(o); return; }
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    parts.push({ geo: g, color: o.material.color, flat: o.material.flatShading });
  });
  const out = new THREE.Group();
  out.position.copy(group.position); out.rotation.copy(group.rotation); out.scale.copy(group.scale);
  const mesh = new THREE.Mesh(bakeParts(parts), vcMaterial());
  mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
  out.add(mesh);
  return { group: out, mesh, keep };
}
