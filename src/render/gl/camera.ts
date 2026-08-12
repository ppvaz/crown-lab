
import { Camera as ThreeCamera, Vector3 } from 'three';

import type { Camera } from '../iso';
import { isoProjection } from './projection';

export class IsoCamera extends ThreeCamera {
  constructor() {
    super();
    this.matrixAutoUpdate = false;
    this.updateMatrixWorld(true);
  }

  updateProjectionMatrix(): void {
    throw new Error(
      'IsoCamera: the projection is iso.ts, not a frustum — call syncIsoCamera(camera, cam)',
    );
  }
}

export const syncIsoCamera = (camera: IsoCamera, cam: Camera): void => {
  camera.projectionMatrix.fromArray(isoProjection(cam));
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
};

export const projectToScreen = (
  camera: IsoCamera,
  cam: Camera,
  point: { x: number; y: number },
  elevation: number,
): { x: number; y: number } => {
  const ndc = new Vector3(point.x, point.y, elevation).project(camera);
  return {
    x: ((ndc.x + 1) / 2) * cam.width,
    y: ((1 - ndc.y) / 2) * cam.height,
  };
};
