// 바닥 패드: 어두운 바닥 + 흰 테두리 + 납부한 만큼 아래에서부터 차오르는 초록 칸
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createPadView(scene, state) {
  const baseMat = new THREE.MeshBasicMaterial({ color: 0x1f2a1c, transparent: true, opacity: 0.45 });
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x5fd35a, transparent: true, opacity: 0.85 });
  const frameMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const views = new Map();
  for (const pad of state.pads) {
    const g = new THREE.Group();
    g.position.set(pad.x, 0.03, pad.z);
    const s = pad.half * 2;
    const base = new THREE.Mesh(new THREE.PlaneGeometry(s, s), baseMat);
    base.rotation.x = -Math.PI / 2;
    const fillGeo = new THREE.PlaneGeometry(s, s);
    fillGeo.translate(0, s / 2, 0); // 아래 변 기준으로 늘어나게
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(0, 0.005, s / 2); // 화면 쪽(+z) 변에서 시작
    const w = 0.12;
    // 테두리 네 변을 한 덩어리로
    const bars = [[0, -pad.half, s + w, w], [0, pad.half, s + w, w], [-pad.half, 0, w, s], [pad.half, 0, w, s]]
      .map(([x, z, sx, sz]) => new THREE.BoxGeometry(sx, 0.04, sz).translate(x, 0.01, z));
    g.add(new THREE.Mesh(mergeGeometries(bars), frameMat));
    g.add(base, fill);
    scene.add(g);
    views.set(pad.id, { g, fill });
  }
  return {
    sync(st, time) {
      for (const pad of st.pads) {
        const v = views.get(pad.id);
        v.g.visible = pad.open;
        if (!pad.open) continue;
        const f = pad.cost > 0 ? pad.paid / pad.cost : 0;
        v.fill.visible = f > 0;
        v.fill.scale.y = Math.max(0.001, f);
        // 납부 중이면 테두리가 살짝 숨쉬듯
        const s = pad.payAcc > 0 ? 1 + Math.sin(time * 12) * 0.03 : 1;
        v.g.scale.set(s, 1, s);
      }
    },
  };
}
