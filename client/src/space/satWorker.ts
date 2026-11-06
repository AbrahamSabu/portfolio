import type { SatelliteElements } from '@watchfloor/shared';
import type { SatRec } from 'satellite.js';
import { ecfAt, groundTrack, nextPass, satelliteNow, toSatrec, writePositions } from './propagate';
import type { WorkerReply, WorkerRequest } from './workerProtocol';

/**
 * The SGP4 worker: every satellite's position for a moment, off the main
 * thread (ten thousand propagations take tens of milliseconds, far more on a
 * busy machine, which the map's own frames can't spare). Answers carry the
 * request's `seq`, so the page can drop answers it no longer wants.
 */

// The client's TypeScript knows the DOM, not workers: this is all we use of the worker scope.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerReply, transfer?: Transferable[]): void;
};

/**
 * Setting a satellite up for SGP4 costs far more than moving it (a tenth of a
 * millisecond or more each), so a catalogue is set up in batches with a
 * pause between them: requests are answered in the gaps, and the satellites
 * set up so far (the stations and weather satellites come first) are drawn
 * while Starlink's eleven thousand follow.
 */
const BATCH = 1000;

let elements: SatelliteElements[] = [];
let satrecs: (SatRec | null)[] = [];
let ready = 0;
let loading = 0;

function setUp(token: number): void {
  if (token !== loading) return; // a newer catalogue took over
  const end = Math.min(elements.length, ready + BATCH);
  for (; ready < end; ready++) satrecs[ready] = toSatrec(elements[ready]!);
  if (ready < elements.length) setTimeout(() => setUp(token), 0);
  else scope.postMessage({ type: 'loaded', usable: satrecs.filter(Boolean).length });
}

scope.onmessage = ({ data: req }) => {
  switch (req.type) {
    case 'load':
      elements = req.satellites;
      satrecs = new Array<SatRec | null>(elements.length).fill(null);
      ready = 0;
      setUp(++loading);
      break;
    case 'positions': {
      const data = new Float32Array(satrecs.length * 3);
      writePositions(satrecs, req.t, data);
      scope.postMessage({ type: 'positions', seq: req.seq, t: req.t, data, complete: ready === elements.length }, [data.buffer]);
      break;
    }
    case 'ecf':
      scope.postMessage({
        type: 'ecf',
        seq: req.seq,
        positions: req.indexes.map((i) => {
          const satrec = satrecs[i];
          return satrec ? ecfAt(satrec, req.t) : null;
        }),
      });
      break;
    case 'track': {
      const satrec = satrecs[req.index];
      const track = satrec
        ? groundTrack(satrec, elements[req.index]!.meanMotion, req.t, req.beforeMs, req.afterMs)
        : { lons: [], lats: [], start: req.t, stepMs: 60_000 };
      scope.postMessage({ type: 'track', seq: req.seq, index: req.index, track });
      break;
    }
    case 'now': {
      const satrec = satrecs[req.index];
      scope.postMessage({ type: 'now', seq: req.seq, index: req.index, now: satrec ? satelliteNow(satrec, req.t) : null });
      break;
    }
    case 'pass': {
      const satrec = satrecs[req.index];
      const pass = satrec ? nextPass(satrec, elements[req.index]!.meanMotion, req.observer, req.t) : { kind: 'none' as const };
      scope.postMessage({ type: 'pass', seq: req.seq, index: req.index, pass });
      break;
    }
  }
};
