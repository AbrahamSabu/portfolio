/**
 * The keyboard shortcuts, as the map key lists them (keyDialog.ts) and a
 * console's Keys tab offers them (console/main.ts, through REMOTE_KEYS in
 * the shared room protocol). Plain data, so the phone's page can load it
 * without the map key's drawing code.
 */
export const SHORTCUTS: Array<[keys: string, action: string]> = [
  ['M', 'Layers: everything the map can show, in one menu'],
  ['L', 'Open or close the track list'],
  ['/', 'Search tracks, airports, chokepoints and areas'],
  ['G', 'Cinematic tour of what is happening'],
  ['Y', 'Sound of the sky: ambient music played by the traffic on screen'],
  ['V', 'Watch handover: the last 24 hours, read back'],
  ['Z', 'Timeline: replay six hours back, project thirty minutes ahead'],
  ['U', 'Rare aircraft: in the air now, and the last 24 hours'],
  ['P', 'Leaderboard: highest, fastest, biggest, busiest airlines, fastest ships'],
  ['E', 'The Stack: aircraft at their real altitude on a tilted map'],
  ['J', 'Ride along: the view from the selected aircraft'],
  ['Q', 'Ops room: host a room for phones and other screens, or join one'],
  ['F', 'Open or close the filter'],
  ['T', 'Trails: all tracks, selected only, off'],
  ['I', 'Traffic currents: the average flow of air and sea traffic'],
  ['S', 'Vehicle shapes or military symbols'],
  ['N', 'Show or hide the news'],
  ['B', 'Open or close the briefing'],
  ['A', 'Show or hide airports'],
  ['H', 'Show or hide earthquakes and disasters'],
  ['D', 'Show or hide findings (rare aircraft, circling, converging, gone silent)'],
  ['C', 'Show or hide shipping chokepoints'],
  ['O', 'Show or hide satellites (space stations, weather, Starlink)'],
  ['W', 'Draw a watch area'],
  ['X', 'Hook a second track: range, bearing, closest approach'],
  ['R', 'Show or hide weather radar'],
  ['?', 'This key'],
  ['Esc', 'Close a panel, or clear the selection'],
];
