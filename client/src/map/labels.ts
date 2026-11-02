/**
 * Callsign labels for the vehicle shapes, drawn as images so they use the
 * app's own typeface and need no glyph server (the offline map has none).
 * Tactical symbols carry their label inside the symbol instead, per 2525.
 */
const PREFIX = 'lbl:';
const FONT_PX = 11;
const FONT = `500 ${FONT_PX}px "IBM Plex Sans Condensed", "Arial Narrow", Arial, sans-serif`;
const INK = '#E4ECF0';
const OUTLINE = 'rgba(9, 16, 21, 0.92)';
const HALO_PX = 3;

export function labelImageId(text: string): string {
  return `${PREFIX}${text}`;
}

export function parseLabelImageId(id: string): string | null {
  return id.startsWith(PREFIX) && id.length > PREFIX.length ? id.slice(PREFIX.length) : null;
}

/** Text with a dark halo, left-aligned in its image (the layer anchors it on the left). */
export function renderLabel(text: string, pixelRatio: number, ink = INK): { image: ImageData; pixelRatio: number } | null {
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return null;
  measure.font = FONT;
  const width = Math.ceil(measure.measureText(text).width) + HALO_PX * 2;
  const height = FONT_PX + HALO_PX * 2 + 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * pixelRatio);
  canvas.height = Math.ceil(height * pixelRatio);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(pixelRatio, pixelRatio);
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = HALO_PX;
  ctx.strokeStyle = OUTLINE;
  ctx.strokeText(text, HALO_PX, height / 2);
  ctx.fillStyle = ink;
  ctx.fillText(text, HALO_PX, height / 2);
  return { image: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio };
}
