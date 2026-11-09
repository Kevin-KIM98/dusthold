// M6 아트 불러오기: assets/manifest.json에 적힌 모델(GLB)·텍스처만 불러온다.
// 하나라도 없거나 망가졌거나 삼각형 상한을 넘으면 그 항목만 도형으로 자동 대체 (경고만, 게임은 계속).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 반환: { models: { 슬롯: { geometry, material, triangles } }, textures: { 이름: { texture, repeat } }, report: [] } */
export async function loadAssets(manifestUrl, artCfg) {
  const out = { models: {}, textures: {}, report: [] };
  if (!manifestUrl) return out;
  let manifest;
  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    manifest = await res.json();
  } catch (e) {
    console.warn('[아트] 목록을 못 읽어 도형으로 진행:', e.message);
    return out;
  }
  const base = new URL(manifestUrl, location.href);
  const loader = new GLTFLoader();
  const limitFor = slot => artCfg.unitSlots.includes(slot) || artCfg.heroSlots.includes(slot) ? artCfg.maxUnitTriangles
    : artCfg.propSlots.includes(slot) ? artCfg.maxPropTriangles : artCfg.maxBuildingTriangles;

  const jobs = Object.entries(manifest.models || {}).map(async ([slot, def]) => {
    try {
      const gltf = await loader.loadAsync(new URL(def.file, base).href);
      const fit = { ...(artCfg.defaultFit[slot] || {}), ...(def.fit || {}) };
      const m = toSingleMesh(gltf.scene, fit, def.yawDeg || 0);
      const limit = limitFor(slot);
      if (m.triangles > limit) throw new Error(`삼각형 ${m.triangles} > 상한 ${limit}`);
      out.models[slot] = m;
      out.report.push(`${slot}: 모델 (${m.triangles}삼각형)`);
    } catch (e) {
      console.warn(`[아트] ${slot} 모델 대신 도형 사용:`, e.message);
      out.report.push(`${slot}: 도형 (${e.message})`);
    }
  });
  const tl = new THREE.TextureLoader();
  for (const [name, def] of Object.entries(manifest.textures || {})) {
    jobs.push(tl.loadAsync(new URL(def.file, base).href).then(tex => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      out.textures[name] = { texture: tex, repeat: def.repeat || 1 };
      out.report.push(`${name}: 텍스처`);
    }).catch(e => {
      console.warn(`[아트] ${name} 텍스처 대신 단색 사용:`, e && e.message);
      out.report.push(`${name}: 단색`);
    }));
  }
  await Promise.all(jobs);
  return out;
}

/**
 * GLB 장면 → 지오메트리 하나 + 재질(들). InstancedMesh로 바로 쓸 수 있게
 * 바닥 중심을 원점(0,0,0)에 두고, fit.height(키) 또는 fit.width(가로 폭)에 맞춰 크기를 맞춘다. +z가 앞.
 */
export function toSingleMesh(root, fit, yawDeg) {
  root.updateMatrixWorld(true);
  const geos = [], mats = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    let g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    // 합치려면 속성이 같아야 함: 위치·법선·UV만 남김
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    geos.push(g);
    mats.push(Array.isArray(o.material) ? o.material[0] : o.material);
  });
  if (!geos.length) throw new Error('메시가 없음');
  const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, true);
  if (!geometry) throw new Error('합치기 실패');
  if (yawDeg) geometry.rotateY(yawDeg * Math.PI / 180);
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox, size = new THREE.Vector3();
  bb.getSize(size);
  const s = fit.height ? fit.height / Math.max(1e-6, size.y) : fit.width ? fit.width / Math.max(1e-6, Math.max(size.x, size.z)) : 1;
  geometry.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geometry.scale(s, s, s);
  geometry.computeBoundingSphere();
  for (const m of mats) { if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; }
  const material = geos.length === 1 ? mats[0] : mats;
  return { geometry, material, triangles: geometry.attributes.position.count / 3 };
}
