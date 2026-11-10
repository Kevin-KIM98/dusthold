// 은화 그리기: 바닥 은화(빙글빙글) · 성주 등 뒤 은화 탑 · 세금 탁자 위 은화 더미. 전부 InstancedMesh.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qx = new THREE.Quaternion(), _p = new THREE.Vector3();
const _pileScale = new THREE.Vector3(1, 1, 1);
const _one = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0), _ax = new THREE.Vector3(1, 0, 0);

export const COIN_COLOR = 0xf2c84b;
export const COIN_RADIUS = 0.24;
const STACK_BACK = -0.75;   // 성주 중심에서 뒤쪽으로 (m)
const STACK_BASE = 1.3;     // 탑 바닥 높이 (m)
const TABLE_TOP = 0.85;

export function makeCoinGeometry(thickness) {
  return new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, thickness, 8); // 8각이면 충분 (작게 보임)
}

export function createCoinView(scene, balance) {
  const t = balance.render.coinThickness;
  const geo = makeCoinGeometry(t);
  const mat = new THREE.MeshLambertMaterial({ color: COIN_COLOR, emissive: 0x3a2a00 });
  const ground = new THREE.InstancedMesh(geo, mat, balance.render.maxGroundCoins);
  const stack = new THREE.InstancedMesh(geo, mat, balance.coins.carryMax);
  const tableMax = balance.buildings.taxTable.max * 2; // 탁자 2개까지 여유
  const table = new THREE.InstancedMesh(geo, mat, tableMax);
  for (const m of [ground, stack, table]) { m.count = 0; m.castShadow = m === stack; m.frustumCulled = false; scene.add(m); } // 바닥 은화는 그림자 생략 (수백 개)
  _qx.setFromAxisAngle(_ax, Math.PI / 2);

  return {
    /** 성주 등 뒤 탑의 맨 위 위치 (날아가는 은화 연출용) */
    stackTop(cmd, n, out) {
      const a = cmd.rotation.y;
      return out.set(cmd.position.x + Math.sin(a) * STACK_BACK, STACK_BASE + n * t, cmd.position.z + Math.cos(a) * STACK_BACK);
    },
    sync(state, cmd, time) {
      // 바닥 은화: 세워서 돌린다. 사라지기 직전 3초는 깜빡임
      let n = 0;
      for (const c of state.coins) {
        if (n >= ground.instanceMatrix.count) break;
        if (c.ttl > 0 && c.ttl < 60 && Math.floor(time * 8) % 2 === 0) continue;
        _q.setFromAxisAngle(_up, time * 3 + c.id).multiply(_qx);
        _p.set(c.x, 0.3 + Math.sin(time * 4 + c.id) * 0.06, c.z);
        const big = c.value > 1 ? 1 + Math.min(1.3, Math.log2(c.value) * 0.3) : 1; // 은화 더미는 크게
        ground.setMatrixAt(n++, _m.compose(_p, _q, _pileScale.setScalar(big)));
      }
      ground.count = n; ground.instanceMatrix.needsUpdate = true;

      // 등 뒤 탑: 걸을 때 살짝 휘청
      const k = state.commander.alive ? state.commander.coins : 0;
      const a = cmd.rotation.y, sx = Math.sin(a), cz = Math.cos(a);
      const sway = state.commander.moving ? Math.sin(time * 10) * 0.004 : 0;
      _q.setFromAxisAngle(_up, a);
      for (let i = 0; i < k; i++) {
        const lean = sway * i;
        _p.set(cmd.position.x + sx * STACK_BACK + cz * lean, STACK_BASE + i * t, cmd.position.z + cz * STACK_BACK - sx * lean);
        stack.setMatrixAt(i, _m.compose(_p, _q, _one));
      }
      stack.count = k; stack.instanceMatrix.needsUpdate = true;

      // 세금 탁자 위: 두 줄로 쌓기
      n = 0;
      for (const b of state.buildings) {
        if (b.kind !== 'taxTable') continue;
        for (let i = 0; i < b.stored && n < tableMax; i++) {
          const col = i % 2, row = Math.floor(i / 2);
          _p.set(b.x - 0.25 + col * 0.5, TABLE_TOP + row * t, b.z);
          table.setMatrixAt(n++, _m.compose(_p, _q.identity(), _one));
        }
      }
      table.count = n; table.instanceMatrix.needsUpdate = true;
    },
  };
}
