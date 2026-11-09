// 연출: 날아가는 은화 (줍기 → 탑으로, 탑 → 패드로, 세금 탁자 → 탑으로). 게임 규칙과 무관.
import * as THREE from 'three';
import { makeCoinGeometry, COIN_COLOR } from './coins.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export function createFx(scene, balance) {
  const max = balance.render.maxFlyingCoins;
  const mesh = new THREE.InstancedMesh(makeCoinGeometry(balance.render.coinThickness),
    new THREE.MeshLambertMaterial({ color: COIN_COLOR, emissive: 0x3a2a00 }), max);
  mesh.count = 0; mesh.frustumCulled = false;
  scene.add(mesh);
  const flights = [];
  const dur = balance.render.flySeconds;

  return {
    /** from, to: THREE.Vector3 (복사해서 보관), delay: 초 */
    fly(from, to, delay = 0) {
      if (flights.length >= max) flights.shift();
      flights.push({ a: from.clone(), b: to.clone(), t: -delay });
    },
    update(dt) {
      let n = 0;
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i];
        f.t += dt;
        if (f.t >= dur) { flights.splice(i, 1); continue; }
        if (f.t < 0) continue;
        const u = f.t / dur;
        _p.lerpVectors(f.a, f.b, u);
        _p.y += Math.sin(u * Math.PI) * 1.2; // 포물선
        _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, u * 10);
        mesh.setMatrixAt(n++, _m.compose(_p, _q, _s));
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
