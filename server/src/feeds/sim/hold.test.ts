import { describe, expect, it } from 'vitest';
import { bearingDeg, distanceM, headingDelta } from '@watchfloor/shared';
import { englishChannel } from '../../scenarios/englishChannel';
import type { Hold, Scenario } from '../../scenarios/types';
import { racetrack, spawn } from './archetypes';
import { advance, HOLD_LEVEL_M } from './motion';
import { Rng } from './rng';

const HEATHROW = { lat: 51.47, lon: -0.454 };
const OCK: Hold = englishChannel.holds!.find((h) => h.name === 'OCK')!;

describe('racetrack', () => {
  it('starts at the fix, turns right to abeam it, and flies the outbound leg parallel to the inbound', () => {
    const [fix, abeam, outEnd, inStart] = racetrack(OCK, 2_000, 7_000);
    expect(fix).toEqual(OCK.fix);
    // Inbound to OCK is 000°, so a right-hand hold's outbound side is to the east.
    expect(bearingDeg(fix!, abeam!)).toBeCloseTo(90, 0);
    expect(distanceM(fix!, abeam!)).toBeCloseTo(4_000, -1);
    expect(bearingDeg(abeam!, outEnd!)).toBeCloseTo(180, 0);
    expect(bearingDeg(inStart!, fix!)).toBeCloseTo(0, 0);
    expect(distanceM(inStart!, fix!)).toBeCloseTo(7_000, -1);
  });

  it('turns the other way in a left-hand hold', () => {
    const [fix, abeam] = racetrack({ ...OCK, rightHand: false });
    expect(bearingDeg(fix!, abeam!)).toBeCloseTo(270, 0);
  });
});

describe('a holding aircraft', () => {
  const scenario: Scenario = { ...englishChannel, holds: [OCK] };
  const START = 1_700_000_000_000;

  function fly(minutes: number) {
    const rng = new Rng(7);
    const e = spawn('holding', { rng, scenario, now: START, id: 'h-1', initial: false, takenCallsigns: new Set() })!;
    const laps: number[] = [];
    let maxFromFix = 0;
    let lastNext = -1;
    let t = START;
    for (; t <= START + minutes * 60_000 && !e.done; t += 250) {
      advance(e, 250, t, rng);
      if (e.behaviour.kind === 'hold') {
        maxFromFix = Math.max(maxFromFix, distanceM(OCK.fix, e.pos));
        if (e.behaviour.next === 1 && lastNext !== 1) laps.push(e.targetAltitudeM!);
        lastNext = e.behaviour.next;
      }
    }
    return { e, laps, maxFromFix, minutes: (t - START) / 60_000 };
  }

  it('joins at the top of the stack, over the fix', () => {
    const e = spawn('holding', { rng: new Rng(1), scenario, now: START, id: 'h-1', initial: false, takenCallsigns: new Set() })!;
    expect(e.altitudeM).toBeCloseTo(OCK.topM, 6);
    expect(e.pos).toEqual(OCK.fix);
    expect(e.platform).toBe('airliner');
  });

  it('flies laps round the racetrack, a level lower each time, close to the fix', () => {
    const { laps, maxFromFix } = fly(20);
    expect(laps.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < laps.length; i++) expect(laps[i - 1]! - laps[i]!).toBeCloseTo(HOLD_LEVEL_M, 6);
    expect(maxFromFix).toBeLessThan(12_000);
  });

  it('takes about four minutes a lap', () => {
    const { laps } = fly(21);
    // Three or more steps down in 21 minutes, but no more than one a minute and a half.
    expect(laps.length).toBeGreaterThanOrEqual(4);
    expect(laps.length).toBeLessThanOrEqual(14);
  });

  it('leaves the bottom of the stack for Heathrow, and lands', () => {
    const { e, laps, minutes } = fly(90);
    expect(laps.at(-1)).toBeCloseTo(OCK.floorM, 6);
    expect(e.done).toBe(true);
    expect(distanceM(e.pos, HEATHROW)).toBeLessThan(5_000);
    expect(minutes).toBeLessThan(60);
    // It was heading for the runway, not still circling.
    expect(Math.abs(headingDelta(e.courseDeg, bearingDeg({ lat: 51.475, lon: -0.18 }, HEATHROW)))).toBeLessThan(60);
  });

  it('starts the simulation with the stacks already busy, spread over the levels', () => {
    const rng = new Rng(3);
    const levels = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const e = spawn('holding', { rng, scenario, now: START, id: `h-${i}`, initial: true, takenCallsigns: new Set() })!;
      levels.add(Math.round((e.altitudeM! - OCK.floorM) / HOLD_LEVEL_M));
    }
    expect(levels.size).toBeGreaterThanOrEqual(5);
    expect(Math.min(...levels)).toBe(0);
    expect(Math.max(...levels)).toBe(6);
  });
});
