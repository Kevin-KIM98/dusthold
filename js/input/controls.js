// 조이스틱 + 키보드 → sim이 쓰는 바닥 평면 방향 { x, z }.
// 화면 위쪽 = 카메라가 바라보는 바닥 방향. (카메라 yaw는 balance.camera.yawDeg)
import { createKeyboard } from './keyboard.js';
import { createJoystick } from './joystick.js';

export function screenToWorld(sx, sy, yawRad) {
  const s = Math.sin(yawRad), c = Math.cos(yawRad);
  // 화면 오른쪽 = (cos, -sin), 화면 위쪽 = (-sin, -cos)
  return { x: sx * c - sy * s, z: -sx * s - sy * c };
}

export function createControls(surface, layer, balance) {
  const kb = createKeyboard(window);
  const joy = createJoystick(surface, layer, balance.joystick);
  const yaw = balance.camera.yawDeg * Math.PI / 180;
  const dead = balance.commander.inputDeadzone;
  return {
    read() {
      const v = joy.active() ? joy.read() : kb.read();
      const m = Math.hypot(v.sx, v.sy);
      if (m < dead) return { x: 0, z: 0 };
      return screenToWorld(v.sx, v.sy, yaw);
    },
  };
}
