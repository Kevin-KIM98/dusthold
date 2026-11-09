// 바닥 평면(x, z) 충돌 계산. 원(나무·바위·유닛)과 축정렬 사각형(성채)만 다룬다.

/** 점 (px,pz)에서 선분 (ax,az)-(bx,bz)까지의 거리 */
export function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t, cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

/** 점에서 꺾은선(points = [[x,z], ...])까지의 최소 거리 */
export function distToPolyline(px, pz, points) {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    best = Math.min(best, distToSegment(px, pz, ax, az, bx, bz));
  }
  return best;
}

/** 원 body {x,z}(반지름 r)를 원 obstacle {x,z,r}에서 밀어낸다. 겹쳤으면 true */
export function pushOutOfCircle(body, r, ob) {
  const dx = body.x - ob.x, dz = body.z - ob.z;
  const minD = r + ob.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minD * minD) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-9) { body.x = ob.x + minD; return true; }
  const k = minD / d;
  body.x = ob.x + dx * k;
  body.z = ob.z + dz * k;
  return true;
}

/** 원 body를 사각형 box {x,z,halfWidth,halfDepth}에서 밀어낸다. 겹쳤으면 true */
export function pushOutOfBox(body, r, box) {
  const minX = box.x - box.halfWidth, maxX = box.x + box.halfWidth;
  const minZ = box.z - box.halfDepth, maxZ = box.z + box.halfDepth;
  const cx = Math.max(minX, Math.min(maxX, body.x));
  const cz = Math.max(minZ, Math.min(maxZ, body.z));
  const dx = body.x - cx, dz = body.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > 1e-12) {
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    body.x = cx + (dx / d) * r;
    body.z = cz + (dz / d) * r;
    return true;
  }
  // 중심이 사각형 안: 가장 가까운 변으로 밀어낸다
  const outs = [
    [body.x - minX, minX - r, null],
    [maxX - body.x, maxX + r, null],
    [body.z - minZ, null, minZ - r],
    [maxZ - body.z, null, maxZ + r],
  ];
  outs.sort((a, b) => a[0] - b[0]);
  const [, nx, nz] = outs[0];
  if (nx !== null) body.x = nx; else body.z = nz;
  return true;
}

/** 맵 경계 안으로 */
export function clampToBounds(body, r, halfSize) {
  const lim = halfSize - r;
  body.x = Math.max(-lim, Math.min(lim, body.x));
  body.z = Math.max(-lim, Math.min(lim, body.z));
}
