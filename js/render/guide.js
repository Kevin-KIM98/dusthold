// 바닥 화살표 안내: 성주 발밑에서 다음 목표까지 흐르는 화살표 + 목표 위에 통통 튀는 표시
import * as THREE from 'three';
import { guideTarget } from '../sim/guide.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1.4, 1, 1.4); // 폰에서 잘 보이게 키움
const _up = new THREE.Vector3(0, 1, 0);

export function createGuideView(scene, balance) {
  const cfg = balance.guide;
  // 갈매기(>) 모양 화살표: +z 방향을 가리키는 납작한 도형
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.45); shape.lineTo(0.45, -0.05); shape.lineTo(0.28, -0.2); shape.lineTo(0, 0.12);
  shape.lineTo(-0.28, -0.2); shape.lineTo(-0.45, -0.05); shape.closePath();
  // 모양의 +y → (X축 -90°) 바닥의 -z → (Y축 180°) 바닥의 +z
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).rotateY(Math.PI);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const arrows = new THREE.InstancedMesh(geo, mat, cfg.maxArrows);
  arrows.count = 0; arrows.frustumCulled = false; arrows.renderOrder = 5; arrows.name = 'guideArrows';
  scene.add(arrows);
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xfff27a }));
  marker.visible = false; marker.name = 'guideMarker';
  scene.add(marker);

  return {
    sync(state, cmdPos, now) {
      const t = guideTarget(state, balance);
      const dx = t ? t.x - cmdPos.x : 0, dz = t ? t.z - cmdPos.z : 0, d = Math.hypot(dx, dz);
      if (!t || d < cfg.hideWithin) { arrows.count = 0; marker.visible = false; return; }
      marker.visible = true;
      marker.position.set(t.x, (t.kind === 'pad' ? 1.6 : 1.1) + Math.abs(Math.sin(now * 4)) * 0.4, t.z);
      marker.rotation.y = now * 2;
      const ux = dx / d, uz = dz / d;
      _q.setFromAxisAngle(_up, Math.atan2(ux, uz));
      const flow = (now * 1.6) % cfg.arrowSpacing; // 앞으로 흐르는 느낌
      let n = 0;
      for (let s = cfg.arrowStart + flow; s < d - 0.9 && n < cfg.maxArrows; s += cfg.arrowSpacing) {
        _p.set(cmdPos.x + ux * s, 0.06, cmdPos.z + uz * s);
        arrows.setMatrixAt(n++, _m.compose(_p, _q, _s));
      }
      arrows.count = n;
      arrows.instanceMatrix.needsUpdate = true;
    },
  };
}
