import { describe, expect, it } from 'vitest';
import { behindPlanet, cameraFromMatrix, projectSatellite, sphereOf, type FrameProjection, type Vec3 } from './projection';

/** A camera on the +z axis looking at the planet's centre, as a column-major view-projection matrix. */
function cameraOnZ(distance: number, fovDeg = 36.87, aspect = 1): number[] {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const near = 0.1;
  const far = 100;
  // Perspective × translate(0, 0, -distance): the camera sits at +z looking down -z.
  const projection = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -distance, 1];
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) out[c * 4 + r]! += projection[k * 4 + r]! * view[c * 4 + k]!;
    }
  }
  return out;
}

describe('the globe projection mirror', () => {
  it('puts Mercator positions on the unit sphere the way MapLibre does', () => {
    const [x, y, z] = sphereOf(0.5, 0.5); // 0°, 0°
    expect(Math.hypot(x, y, z)).toBeCloseTo(1);
    expect(y).toBeCloseTo(0);
    expect(sphereOf(0.5, 0)[1]).toBeCloseTo(Math.sin((85.0511 * Math.PI) / 180), 4);
  });

  it('recovers the camera from its matrix', () => {
    const camera = cameraFromMatrix(cameraOnZ(5))!;
    expect(camera[0]).toBeCloseTo(0);
    expect(camera[1]).toBeCloseTo(0);
    expect(camera[2]).toBeCloseTo(5);
  });

  it('hides what the planet is in front of, but not what peeks over the edge', () => {
    const camera: Vec3 = [0, 0, 5];
    expect(behindPlanet([0, 0, 1], camera)).toBe(false); // facing us, on the surface
    expect(behindPlanet([0, 0, -1.1], camera)).toBe(true); // straight behind
    expect(behindPlanet([0, 1.1, -0.2], camera)).toBe(false); // above the limb, slightly behind it
  });

  it('projects the point facing the camera to the middle of the screen', () => {
    const main = cameraOnZ(5);
    const frame: FrameProjection = {
      globe: true,
      main,
      fallback: main,
      transition: 1,
      clippingPlane: [0, 0, 1, -0.2],
      camera: [0, 0, 5],
      width: 800,
      height: 800,
    };
    // Mercator x 0.75, y 0.5 is 90°E on the equator; on MapLibre's sphere that faces +z? Find the one that does.
    const facing = [0, 0.25, 0.5, 0.75].find((mx) => sphereOf(mx, 0.5)[2] > 0.99)!;
    const centre = projectSatellite(facing, 0.5, 0, frame)!;
    expect(centre.x).toBeCloseTo(400, 3);
    expect(centre.y).toBeCloseTo(400, 3);
    // The opposite side is round the back.
    expect(projectSatellite((facing + 0.5) % 1, 0.5, 0, frame)).toBeNull();
    // Raised, the same ground point stays in the middle: it comes straight at the camera.
    const raised = projectSatellite(facing, 0.5, 400_000, frame)!;
    expect(raised.x).toBeCloseTo(400, 3);
  });
});
