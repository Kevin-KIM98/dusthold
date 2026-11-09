// 유닛 그리기: 궁수 · 약탈자 · 방패 약탈자 · 바위 거인 (부위별 InstancedMesh) + 머리 위 체력 바
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** 부위 목록 [{ geo, color, flat }] 으로 같은 모양 여러 개를 그리는 묶음. 부위 위치는 지오메트리에 미리 구워 둔다 */
function makeRig(scene, parts, max) {
  const meshes = parts.map(pt => {
    const m = new THREE.InstancedMesh(pt.geo, new THREE.MeshLambertMaterial({ color: pt.color, flatShading: !!pt.flat }), max);
    m.count = 0; m.castShadow = true; m.frustumCulled = false;
    scene.add(m);
    return m;
  });
  return {
    /** items: [{ x, z, y, angle, scale }] */
    sync(items) {
      const n = Math.min(items.length, max);
      for (let i = 0; i < n; i++) {
        const it = items[i];
        _p.set(it.x, it.y || 0, it.z);
        _q.setFromAxisAngle(_up, it.angle);
        _s.setScalar(it.scale || 1);
        _m.compose(_p, _q, _s);
        for (const m of meshes) m.setMatrixAt(i, _m);
      }
      for (const m of meshes) { m.count = n; m.instanceMatrix.needsUpdate = true; }
    },
  };
}

const g = {
  cyl: (rt, rb, h, y, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, y, 0),
  sph: (r, y, z = 0) => new THREE.SphereGeometry(r, 8, 6).translate(0, y, z),
  cone: (r, h, y, seg = 8) => new THREE.ConeGeometry(r, h, seg).translate(0, y, 0),
  box: (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z),
  rock: (r, x, y, z, sy = 1) => new THREE.DodecahedronGeometry(r, 0).scale(1, sy, 1).translate(x, y, z),
};

function archerParts() {
  const bow = new THREE.TorusGeometry(0.32, 0.03, 4, 10, Math.PI).rotateZ(-Math.PI / 2).rotateY(Math.PI / 2).translate(0.28, 0.85, 0.15);
  return [
    { geo: g.cyl(0.16, 0.28, 0.75, 0.38), color: 0x3d7a46 },   // 초록 망토
    { geo: g.sph(0.15, 0.92), color: 0xe8b98f },               // 얼굴
    { geo: g.cone(0.19, 0.3, 1.12), color: 0x2b5a33 },         // 두건
    { geo: bow, color: 0x7a4a26 },                             // 활
    { geo: g.box(0.12, 0.4, 0.12, -0.12, 0.75, -0.2), color: 0x8a5a34 }, // 화살통
  ];
}

function raiderParts() {
  return [
    { geo: g.cyl(0.2, 0.3, 0.7, 0.35), color: 0x6b4a32 },     // 가죽 옷
    { geo: g.sph(0.17, 0.85), color: 0xc9a27e },
    { geo: g.cone(0.22, 0.35, 1.07, 6), color: 0x7a2330 },     // 붉은 두건
    { geo: g.box(0.1, 0.55, 0.1, 0.3, 0.55, 0.15), color: 0x4a3524 }, // 몽둥이
  ];
}

function shieldParts() {
  const shield = new THREE.CylinderGeometry(0.38, 0.38, 0.08, 10).rotateX(Math.PI / 2).translate(0, 0.6, 0.38);
  return [
    { geo: g.cyl(0.26, 0.36, 0.8, 0.4), color: 0x4b4e57 },
    { geo: g.sph(0.19, 0.95), color: 0xc9a27e },
    { geo: g.cyl(0.2, 0.22, 0.18, 1.08), color: 0x7d838c },    // 투구
    { geo: shield, color: 0x8a5a34 },
    { geo: new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8).rotateX(Math.PI / 2).translate(0, 0.6, 0.43), color: 0xb9b2a4 },
  ];
}

function giantParts() {
  return [
    { geo: g.rock(1.0, 0, 1.45, 0, 1.1), color: 0x7f7a70, flat: true },    // 몸통 바위
    { geo: g.rock(0.45, 0, 2.75, 0.2), color: 0x8d877c, flat: true },      // 머리
    { geo: g.rock(0.45, -1.1, 1.3, 0.2), color: 0x6f6a61, flat: true },    // 팔
    { geo: g.rock(0.45, 1.1, 1.3, 0.2), color: 0x6f6a61, flat: true },
    { geo: g.rock(0.4, -0.45, 0.35, 0), color: 0x6f6a61, flat: true },     // 다리
    { geo: g.rock(0.4, 0.45, 0.35, 0), color: 0x6f6a61, flat: true },
    { geo: g.rock(0.55, 0, 2.15, -0.35, 0.4), color: 0x5d8a3e, flat: true }, // 등 이끼
    { geo: g.box(0.12, 0.08, 0.05, -0.15, 2.85, 0.6), color: 0xffd25a },  // 빛나는 눈
    { geo: g.box(0.12, 0.08, 0.05, 0.15, 2.85, 0.6), color: 0xffd25a },
  ];
}

// 화면에서 잘 보이도록 모델만 키움 (충돌 반지름은 sim 값 그대로)
const UNIT_SCALE = 1.25;

// 머리 위 체력 바 높이(m, 키운 뒤 기준)
const BAR_Y = { archer: 1.95, raider: 1.95, shield: 2.15, giant: 4.4, commander: 2.9, castle: 7.6 };
const BAR_W = { archer: 0.8, raider: 0.8, shield: 0.95, giant: 2.2, commander: 1.1, castle: 4.5 };

export function createUnitView(scene, balance) {
  const r = balance.render;
  const archers = makeRig(scene, archerParts(), r.maxArchers);
  const enemies = {
    raider: makeRig(scene, raiderParts(), r.maxEnemies),
    shield: makeRig(scene, shieldParts(), r.maxEnemies),
    giant: makeRig(scene, giantParts(), 8),
  };

  // 체력 바: 배경 + 채움 (화면을 향하는 평면)
  const maxBars = r.maxEnemies + r.maxArchers + 4;
  const barGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0); // 왼쪽 끝 기준
  const mk = (color) => {
    const m = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color, depthWrite: false, depthTest: false, toneMapped: false }), maxBars);
    m.count = 0; m.frustumCulled = false; m.renderOrder = 10;
    scene.add(m);
    return m;
  };
  const barBg = mk(0x1a1a1a), barFill = mk(0xffffff);
  barFill.renderOrder = 11;
  const RED = new THREE.Color(0xe0453a), GREEN = new THREE.Color(0x5fd35a), GOLD = new THREE.Color(0xf2c84b);
  const _right = new THREE.Vector3(), _bp = new THREE.Vector3();

  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
  const pose = (u, alpha, now, hop) => ({
    x: lerp(u.prevX, u.x, alpha), z: lerp(u.prevZ, u.z, alpha),
    angle: lerpAngle(u.prevAngle, u.angle, alpha),
    y: u.moving ? Math.abs(Math.sin(now * 10 + u.id)) * hop : 0,
    scale: UNIT_SCALE,
  });

  return {
    sync(state, alpha, now, camera, commanderPos) {
      archers.sync(state.archers.map(a => pose(a, alpha, now, 0.08)));
      const byType = { raider: [], shield: [], giant: [] };
      for (const e of state.enemies) {
        const p = pose(e, alpha, now, e.type === 'giant' ? 0.12 : 0.07);
        if (e.attacking) { // 공격 중엔 앞으로 꿈틀
          const lunge = Math.max(0, Math.sin(now * 9 + e.id)) * 0.18;
          p.x += Math.sin(p.angle) * lunge; p.z += Math.cos(p.angle) * lunge;
        }
        (byType[e.type] || byType.raider).push(p);
      }
      for (const k in enemies) enemies[k].sync(byType[k]);

      // 체력 바 (닳은 것만)
      _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      let n = 0;
      const bar = (x, y, z, w, frac, color) => {
        if (n >= maxBars) return;
        const h = Math.max(0.1, w * 0.12);
        _bp.set(x, y, z).addScaledVector(_right, -w / 2);
        barBg.setMatrixAt(n, _m.compose(_bp, camera.quaternion, _s.set(w, h, 1)));
        barFill.setMatrixAt(n, _m.compose(_bp, camera.quaternion, _s.set(Math.max(0.001, w * frac), h * 0.7, 1)));
        barFill.setColorAt(n, color);
        n++;
      };
      for (const e of state.enemies) if (e.hp < e.maxHp) {
        const p = pose(e, alpha, now, 0);
        bar(p.x, BAR_Y[e.type], p.z, BAR_W[e.type], e.hp / e.maxHp, RED);
      }
      for (const a of state.archers) if (a.hp < a.maxHp) {
        const p = pose(a, alpha, now, 0);
        bar(p.x, BAR_Y.archer, p.z, BAR_W.archer, a.hp / a.maxHp, GREEN);
      }
      const c = state.commander;
      if (c.alive && c.hp < balance.commander.hp) bar(commanderPos.x, BAR_Y.commander, commanderPos.z, BAR_W.commander, c.hp / balance.commander.hp, GREEN);
      const k = state.castle;
      if (k.hp < k.maxHp) bar(k.x, BAR_Y.castle, k.z, BAR_W.castle, k.hp / k.maxHp, GOLD);
      barBg.count = barFill.count = n;
      barBg.instanceMatrix.needsUpdate = barFill.instanceMatrix.needsUpdate = true;
      if (barFill.instanceColor) barFill.instanceColor.needsUpdate = true;
    },
  };
}
