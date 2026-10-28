import type { DataDrivenPropertyValueSpecification } from 'maplibre-gl';

/** Matches milsymbol's "Light" fills, so shapes, leaders and trails share their symbol's colour. */
export const AFFILIATION_COLOR = {
  friend: '#80E0FF',
  hostile: '#FF8080',
  neutral: '#AAFFAA',
  unknown: '#FFFF80',
  pending: '#FFFF80',
} as const;

/** Line colour from a feature's `affiliation` property. Shared by leaders and trails. */
export const AFFILIATION_LINE_COLOR: DataDrivenPropertyValueSpecification<string> = [
  'match',
  ['get', 'affiliation'],
  'friend', AFFILIATION_COLOR.friend,
  'hostile', AFFILIATION_COLOR.hostile,
  'neutral', AFFILIATION_COLOR.neutral,
  AFFILIATION_COLOR.unknown,
];
