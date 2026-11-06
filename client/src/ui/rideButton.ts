import { canRide, type RideAlong } from '../map/rideAlong';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';

/**
 * "Ride along" beside Follow in an aircraft's details panel. Added from here
 * rather than written into the panel's markup, so the panel stays as it was;
 * shown only for aircraft that report an altitude (the ride needs one).
 */
export function addRideButton(details: HTMLElement, store: TrackStore, selection: Selection, ride: RideAlong): void {
  const actions = details.querySelector('.details-actions');
  if (!actions) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.title = 'The view from this aircraft (J)';
  actions.append(button);

  const refresh = () => {
    const id = selection.id;
    button.hidden = !canRide(id ? store.get(id) : undefined);
    const riding = ride.value && ride.riding === id;
    button.textContent = riding ? 'Leave the ride' : 'Ride along';
    button.setAttribute('aria-pressed', String(riding));
  };
  button.addEventListener('click', () => (ride.value ? ride.stop() : ride.start(selection.id)));
  selection.subscribe(refresh);
  store.subscribe(refresh);
  ride.subscribe(refresh);
  refresh();
}
