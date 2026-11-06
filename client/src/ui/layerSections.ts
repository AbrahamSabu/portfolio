import type { TrailMode, TrailStyle } from '../map/trailLayer';
import type { SymbolStyle } from '../state/symbolStyle';
import type { LayerSection } from './layersMenu';

interface Toggle {
  readonly value: boolean;
  set(on: boolean): void;
  subscribe(listener: () => void): unknown;
}

/** What the menu needs: the settings the keys already use. */
export interface LayerDeps {
  style: { readonly value: SymbolStyle; set(style: SymbolStyle): void; subscribe(listener: () => void): unknown };
  trails: {
    readonly mode: TrailMode;
    readonly style: TrailStyle;
    set(mode: TrailMode): void;
    setStyle(style: TrailStyle): void;
    subscribe(listener: () => void): unknown;
  };
  news: { readonly shown: boolean; readonly voice: boolean; set(change: { shown?: boolean; voice?: boolean }): void; subscribe(listener: () => void): unknown };
  briefing: Toggle;
  airports: Toggle;
  hazards: Toggle;
  findings: Toggle;
  chokepoints: Toggle;
  radar: Toggle;
  radarTime: () => string;
  regions: Toggle;
  drawArea: () => void;
  manageAreas: () => void;
  sound: Toggle;
  search: () => void;
  tour: () => void;
  handover: () => void;
  rare: () => void;
  timeline: () => void;
  phosphor: Toggle;
  currents: Toggle;
  exposure: Toggle;
}

/** The Layers menu's rows, wired to the same settings as the keys. */
export function layerSections(d: LayerDeps): LayerSection[] {
  const toggle = (label: string, hint: string, key: string | undefined, t: Toggle, detail?: () => string) => ({
    kind: 'switch' as const,
    label,
    hint,
    ...(key ? { key } : {}),
    get: () => t.value,
    set: (on: boolean) => t.set(on),
    ...(detail ? { detail } : {}),
    watch: [t],
  });
  return [
    {
      title: 'Traffic',
      rows: [
        {
          kind: 'choice',
          label: 'Symbols',
          key: 'S',
          options: [
            { value: 'shapes', label: 'Vehicle shapes' },
            { value: 'tactical', label: 'Military symbols' },
          ],
          get: () => d.style.value,
          set: (v) => d.style.set(v as SymbolStyle),
          watch: [d.style],
        },
        {
          kind: 'choice',
          label: 'Trails',
          key: 'T',
          options: [
            { value: 'all', label: 'All' },
            { value: 'selected', label: 'Selected' },
            { value: 'off', label: 'Off' },
          ],
          get: () => d.trails.mode,
          set: (v) => d.trails.set(v as TrailMode),
          watch: [d.trails],
        },
        {
          kind: 'choice',
          label: 'Trail style',
          options: [
            { value: 'line', label: 'Line' },
            { value: 'scope', label: 'Scope blips' },
          ],
          get: () => d.trails.style,
          set: (v) => d.trails.setStyle(v as TrailStyle),
          watch: [d.trails],
        },
      ],
    },
    {
      title: 'News',
      rows: [
        {
          kind: 'switch',
          label: 'News on the map',
          hint: 'Markers, pop-up cards and the ticker',
          key: 'N',
          get: () => d.news.shown,
          set: (on) => d.news.set({ shown: on }),
          watch: [d.news],
        },
        {
          kind: 'switch',
          label: 'Briefing',
          hint: 'Top stories of the last six hours',
          key: 'B',
          get: () => d.briefing.value && d.news.shown,
          // The briefing is news: asking for it turns news on.
          set: (on) => {
            if (on && !d.news.shown) d.news.set({ shown: true });
            d.briefing.set(on);
          },
          watch: [d.briefing, d.news],
        },
        {
          kind: 'switch',
          label: 'Read aloud',
          hint: 'New stories and alerts, spoken',
          get: () => d.news.voice,
          set: (on) => d.news.set({ voice: on }),
          watch: [d.news],
        },
      ],
    },
    {
      title: 'World',
      rows: [
        toggle('Airports', 'About 6,000; more as you zoom in', 'A', d.airports),
        toggle('Earthquakes and disasters', 'USGS and GDACS', 'H', d.hazards),
        toggle('Findings', 'Rare aircraft, circling, converging military, ships gone silent', 'D', d.findings),
        toggle('Shipping chokepoints', 'Ships at eight narrows', 'C', d.chokepoints),
        toggle('Weather radar', 'RainViewer, in grey', 'R', d.radar, d.radarTime),
        { kind: 'action', label: 'Search the map', key: '/', run: d.search },
        { kind: 'action', label: 'Cinematic tour', key: 'G', run: d.tour },
        { kind: 'action', label: 'Watch handover', key: 'V', run: d.handover },
        { kind: 'action', label: 'Timeline', key: 'Z', run: d.timeline },
        { kind: 'action', label: 'Rare aircraft', key: 'U', run: d.rare },
      ],
    },
    {
      title: 'Watch areas',
      rows: [
        toggle('Show areas', 'Alerts keep working when hidden', undefined, d.regions),
        { kind: 'action', label: 'Draw a new area', key: 'W', run: d.drawArea },
        { kind: 'action', label: 'Manage areas and activity', run: d.manageAreas },
      ],
    },
    {
      title: 'Alerts',
      rows: [toggle('Sound', 'A short ping for squawks and area alerts', undefined, d.sound)],
    },
    {
      title: 'Display',
      rows: [
        toggle('Phosphor scope', 'Everything in single-gun green; identity colours rest', undefined, d.phosphor),
        toggle('Traffic currents', 'Particles follow the average flow of the traffic, not wind', 'I', d.currents),
        toggle('Long exposure', 'Movement burns in while the camera holds still', undefined, d.exposure),
      ],
    },
  ];
}
