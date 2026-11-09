// 연출: 날아가는 은화 (줍기 → 탑으로, 탑 → 패드로, 세금 탁자 → 탑으로). 게임 규칙과 무관.
import * as THREE from 'three';
import { makeCoinGeometry, COIN_COLOR } from './coins.js';
import { bakeParts, vcMaterial } from './merge.js';

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

  // 칼바람: 성주 앞에 반달 모양이 휙 퍼지며 사라짐 (투명도 때문에 몇 개만 돌려 씀)
  const slashes = [];
  const slashGeo = new THREE.RingGeometry(0.7, 1.6, 18, 1, Math.PI / 2 - 1.1, 2.2).rotateX(-Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(slashGeo, new THREE.MeshBasicMaterial({ color: 0xe6fbff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false; m.renderOrder = 6; m.name = 'slashFx';
    scene.add(m);
    slashes.push({ m, t: 1 });
  }
  const slashDur = balance.render.slashSeconds * 1.3;
  // 손도끼: 나무 자루 + 은색 날 (한 덩어리), 날아가며 빙글빙글
  const axeMax = balance.render.maxAxes, axeDur = balance.render.axeFlightSeconds;
  const axeGeo = bakeParts([
    { geo: new THREE.BoxGeometry(0.06, 0.55, 0.06), color: 0x7a4a26 },
    { geo: new THREE.BoxGeometry(0.06, 0.24, 0.3).translate(0, 0.2, 0.12), color: 0xdfe5ea },
  ]);
  const axes = new THREE.InstancedMesh(axeGeo, vcMaterial(), axeMax);
  axes.count = 0; axes.frustumCulled = false; axes.name = 'axeFx'; axes.castShadow = true;
  scene.add(axes);
  const flying = [];
  const _e = new THREE.Euler();
  let slashNext = 0;

  return {
    slash(x, z, yaw) {
      const s = slashes[slashNext++ % slashes.length];
      s.t = 0;
      s.m.position.set(x, 1.15, z);
      s.m.rotation.y = yaw + Math.PI; // 링의 +z 쪽이 앞
      s.m.visible = true;
    },
    throwAxe(x, z, tx, tz) {
      if (flying.length >= axeMax) flying.shift();
      flying.push({ a: new THREE.Vector3(x, 2.0, z), b: new THREE.Vector3(tx, 0.9, tz), yaw: Math.atan2(tx - x, tz - z), t: 0 });
    },
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

      n = 0;
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i];
        f.t += dt;
        if (f.t >= axeDur) { flying.splice(i, 1); continue; }
        const u = f.t / axeDur;
        _p.lerpVectors(f.a, f.b, u);
        _p.y += Math.sin(u * Math.PI) * 1.4; // 포물선
        _q.setFromEuler(_e.set(u * Math.PI * 6, f.yaw, 0, 'YXZ')); // 앞으로 빙글빙글
        axes.setMatrixAt(n++, _m.compose(_p, _q, _s.set(1.3, 1.3, 1.3)));
      }
      axes.count = n; axes.instanceMatrix.needsUpdate = true;

      for (const s of slashes) {
        if (!s.m.visible) continue;
        s.t += dt;
        const u = s.t / slashDur;
        if (u >= 1) { s.m.visible = false; continue; }
        s.m.material.opacity = 0.9 * (1 - u);
        s.m.scale.setScalar(0.8 + u * 0.6);
      }
    },
  };
}
