// 고정 쿼터뷰 카메라. 성주를 부드럽게 따라간다.
// 화면 비율과 상관없이 좌우 viewWidth·위아래 viewHeight(미터) 이상이 보이도록 거리를 정한다.
import * as THREE from 'three';

export function createFollowCamera(cfg, aspect) {
  const cam = new THREE.PerspectiveCamera(cfg.fovDeg, aspect, 0.5, 300);
  const pitch = cfg.pitchDeg * Math.PI / 180;
  const yaw = cfg.yawDeg * Math.PI / 180;
  const offset = new THREE.Vector3();
  const target = new THREE.Vector3();
  let snapped = false;
  let distance = 0;

  function fit(a) {
    const halfV = Math.tan(cfg.fovDeg * Math.PI / 360);
    const byWidth = (cfg.viewWidth / 2) / (halfV * a);
    const byHeight = (cfg.viewHeight / 2) / halfV;
    distance = Math.min(cfg.maxDistance, Math.max(byWidth, byHeight));
    const horiz = distance * Math.cos(pitch);
    offset.set(Math.sin(yaw) * horiz, distance * Math.sin(pitch), Math.cos(yaw) * horiz);
    cam.aspect = a;
    cam.updateProjectionMatrix();
  }
  function apply() {
    cam.position.copy(target).add(offset);
    cam.lookAt(target);
  }
  fit(aspect);

  return {
    camera: cam,
    target,
    distance: () => distance,
    /** x, z = 따라갈 바닥 좌표, dt = 실제 경과 초 */
    update(x, z, dt) {
      if (!snapped) { target.set(x, 0, z); snapped = true; }
      else {
        const k = 1 - Math.exp(-cfg.follow * dt);
        target.x += (x - target.x) * k;
        target.z += (z - target.z) * k;
      }
      apply();
    },
    resize(a) { fit(a); apply(); },
  };
}
