// 성벽: 성채 둘레를 네모나게 감싸는 구간들. 길이 지나는 자리는 성문(아군만 통과).
// 구간 = 축정렬 사각형 { id, x, z, halfWidth, halfDepth, hp, maxHp, gate, side }

/** 꺾은선이 네모(중심 0,0 반변 W)의 테두리를 처음 넘는 점 (바깥 → 안) */
function crossing(points, W) {
  const f = p => Math.max(Math.abs(p[0]), Math.abs(p[1])) - W;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    if (f(a) >= 0 && f(b) < 0) {
      let lo = 0, hi = 1;
      for (let k = 0; k < 40; k++) {
        const m = (lo + hi) / 2;
        const p = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m];
        if (f(p) >= 0) lo = m; else hi = m;
      }
      return [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo];
    }
  }
  return null;
}

/** 성벽 구간 목록을 만든다 (상태에는 넣지 않음) */
export function layoutWalls(state, balance) {
  const cfg = balance.walls;
  const W = cfg.half, t = cfg.thickness, cx = state.castle.x, cz = state.castle.z;
  // 변: 'south'(z=+W), 'north'(z=-W)는 x 방향으로 모서리 포함, 'east'/'west'는 z 방향으로 모서리 제외
  const sides = [
    { side: 'south', axis: 'x', fixed: W, from: -W - t / 2, to: W + t / 2 },
    { side: 'north', axis: 'x', fixed: -W, from: -W - t / 2, to: W + t / 2 },
    { side: 'east', axis: 'z', fixed: W, from: -W + t / 2, to: W - t / 2 },
    { side: 'west', axis: 'z', fixed: -W, from: -W + t / 2, to: W - t / 2 },
  ];
  const gates = [];
  for (const p of state.paths) {
    const pts = p.points.map(q => [q[0] - cx, q[1] - cz]);
    const c = crossing(pts, W);
    if (!c) continue;
    const onX = Math.abs(Math.abs(c[1]) - W) < Math.abs(Math.abs(c[0]) - W); // z가 ±W이면 남/북 변
    const side = onX ? (c[1] > 0 ? 'south' : 'north') : (c[0] > 0 ? 'east' : 'west');
    gates.push({ side, at: onX ? c[0] : c[1], pathId: p.id });
  }
  const out = [];
  const push = (s, a, b, gate) => {
    const mid = (a + b) / 2, half = (b - a) / 2;
    if (half < 0.05) return;
    const seg = s.axis === 'x'
      ? { x: cx + mid, z: cz + s.fixed, halfWidth: half, halfDepth: t / 2 }
      : { x: cx + s.fixed, z: cz + mid, halfWidth: t / 2, halfDepth: half };
    out.push({ ...seg, gate, side: s.side });
  };
  for (const s of sides) {
    const gs = gates.filter(g => g.side === s.side).sort((a, b) => a.at - b.at);
    const cuts = [];
    let cur = s.from;
    for (const g of gs) {
      cuts.push([cur, g.at - cfg.gateLength / 2]);
      push(s, g.at - cfg.gateLength / 2, g.at + cfg.gateLength / 2, true);
      cur = g.at + cfg.gateLength / 2;
    }
    cuts.push([cur, s.to]);
    for (const [a, b] of cuts) {
      const len = b - a;
      if (len <= 0) continue;
      const n = Math.max(1, Math.ceil(len / cfg.segmentLength - 1e-9));
      for (let i = 0; i < n; i++) push(s, a + (len * i) / n, a + (len * (i + 1)) / n, false);
    }
  }
  return out;
}

/** 성벽을 (다시) 세운다. level 1 = 목책, 2 = 돌벽. 부서진 구간도 모두 새로 */
export function buildWalls(state, balance, level) {
  const hp = level >= 2 ? balance.walls.stoneHp : balance.walls.woodHp;
  state.walls = layoutWalls(state, balance).map(w => ({ id: state.nextId++, ...w, hp, maxHp: hp }));
  state.wallLevel = level;
  state.events.push({ type: 'wallsBuilt', level });
}

/** 점에서 사각형 가장자리까지 거리와 가장 가까운 점 */
export function boxDist(box, x, z) {
  const px = Math.max(box.x - box.halfWidth, Math.min(box.x + box.halfWidth, x));
  const pz = Math.max(box.z - box.halfDepth, Math.min(box.z + box.halfDepth, z));
  return { d: Math.hypot(x - px, z - pz), px, pz };
}
