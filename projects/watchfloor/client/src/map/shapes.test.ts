import { describe, expect, it } from 'vitest';
import { TRACK_VALUES } from '@watchfloor/shared';
import { parseShapeImageId, shapeFor, shapeImageId, SHAPES } from './shapes';
import { labelImageId, parseLabelImageId } from './labels';

describe('shapeFor', () => {
  it('gives every platform a drawn shape', () => {
    for (const platform of TRACK_VALUES.platform) {
      const { shape, scale } = shapeFor({ platform });
      expect(SHAPES[shape].body).toMatch(/^M/);
      expect(scale).toBeGreaterThan(0);
      expect(scale).toBeLessThanOrEqual(1);
    }
  });

  it('draws wide-bodies at full size and narrow-bodies smaller', () => {
    expect(shapeFor({ platform: 'airliner', typeCode: 'B77W' }).scale).toBe(1);
    expect(shapeFor({ platform: 'airliner', typeCode: 'A388' }).scale).toBe(1);
    expect(shapeFor({ platform: 'airliner', typeCode: 'A359' }).scale).toBe(1);
    expect(shapeFor({ platform: 'airliner', typeCode: 'A320' }).scale).toBeLessThan(1);
    expect(shapeFor({ platform: 'airliner', typeCode: 'A21N' }).scale).toBeLessThan(1);
    expect(shapeFor({ platform: 'airliner', typeCode: 'B38M' }).scale).toBeLessThan(1);
    expect(shapeFor({ platform: 'airliner' }).scale).toBeLessThan(1);
  });

  it('draws small things smaller than big things', () => {
    expect(shapeFor({ platform: 'light-aircraft' }).scale).toBeLessThan(shapeFor({ platform: 'airliner' }).scale);
    expect(shapeFor({ platform: 'leisure' }).scale).toBeLessThan(shapeFor({ platform: 'cargo' }).scale);
  });

  it('shares shapes where the airframe is the same', () => {
    expect(shapeFor({ platform: 'military-helicopter' }).shape).toBe('helicopter');
    expect(shapeFor({ platform: 'military-aircraft' }).shape).toBe('military-jet');
  });
});

describe('image ids', () => {
  it('round-trips a shape id', () => {
    expect(parseShapeImageId(shapeImageId('tanker', 'neutral'))).toEqual({ shape: 'tanker', affiliation: 'neutral' });
  });

  it('rejects ids it did not make', () => {
    expect(parseShapeImageId('veh:spaceship:unknown')).toBeNull();
    expect(parseShapeImageId('veh:cargo:enemy')).toBeNull();
    expect(parseShapeImageId('sym:SUAPCF----------')).toBeNull();
  });

  it('round-trips a label, colons and all', () => {
    expect(parseLabelImageId(labelImageId('RYR8:AB'))).toBe('RYR8:AB');
    expect(parseLabelImageId('lbl:')).toBeNull();
    expect(parseLabelImageId('veh:cargo:unknown')).toBeNull();
  });
});
