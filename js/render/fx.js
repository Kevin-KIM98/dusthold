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

  // 화살: 가는 막대가 궁수 → 적으로
  const arrowMax = balance.render.maxArrows, arrowDur = balance.render.arrowSeconds;
  const arrowGeo = new THREE.BoxGeometry(0.04, 0.04, 0.6);
  const arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0x3a2a1a }), arrowMax);
  arrows.count = 0; arrows.frustumCulled = false; scene.add(arrows);
  const shots = [];
  // 처치 연기: 작은 돌덩이들이 퍼지며 작아짐 (연출이라 Math.random 허용)
  const puffMax = 160, puffDur = 0.45;
  const puffs = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.16, 0), new THREE.MeshLambertMaterial({ color: 0xe8e2d4, flatShading: true }), puffMax);
  puffs.count = 0; puffs.frustumCulled = false; scene.add(puffs);
  const bits = [];
  const _d = new THREE.Vector3(), _fwd = new THREE.Vector3(0, 0, 1);

  return {
    shoot(x, z, tx, tz, y = 1.0) {
      if (shots.length >= arrowMax) shots.shift();
      shots.push({ a: new THREE.Vector3(x, y, z), b: new THREE.Vector3(tx, 0.8, tz), t: 0 });
    },
    puff(x, z, size = 1) {
      const n = Math.round(8 * size);
      for (let i = 0; i < n; i++) {
        if (bits.length >= puffMax) bits.shift();
        const a = Math.random() * Math.PI * 2, sp = (1.2 + Math.random() * 1.5) * size;
        bits.push({ p: new THREE.Vector3(x, 0.5 * size, z), v: new THREE.Vector3(Math.cos(a) * sp, 1.5 + Math.random() * 2, Math.sin(a) * sp), t: 0, s: size });
      }
    },
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
        mesh.setMatrixAt(n++, _m.compose(_p, _q, _s.set(1, 1, 1)));
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;

      n = 0;
      for (let i = shots.length - 1; i >= 0; i--) {
        const f = shots[i];
        f.t += dt;
        if (f.t >= arrowDur) { shots.splice(i, 1); continue; }
        const u = f.t / arrowDur;
        _p.lerpVectors(f.a, f.b, u);
        _p.y += Math.sin(u * Math.PI) * 0.6;
        _d.subVectors(f.b, f.a).normalize();
        _q.setFromUnitVectors(_fwd, _d);
        arrows.setMatrixAt(n++, _m.compose(_p, _q, _s.set(1, 1, 1)));
      }
      arrows.count = n; arrows.instanceMatrix.needsUpdate = true;

      n = 0;
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.t += dt;
        if (b.t >= puffDur) { bits.splice(i, 1); continue; }
        b.v.y -= 9 * dt;
        b.p.addScaledVector(b.v, dt);
        if (b.p.y < 0.05) { b.p.y = 0.05; b.v.y = 0; }
        const k = (1 - b.t / puffDur) * b.s;
        puffs.setMatrixAt(n++, _m.compose(b.p, _q.identity(), _s.set(k, k, k)));
      }
      puffs.count = n; puffs.instanceMatrix.needsUpdate = true;
    },
  };
}
