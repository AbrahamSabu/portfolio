/**
 * Space behind the globe. Outside the globe the map's canvas is transparent,
 * so whatever the map's own element shows is what's around the planet:
 * here, a deep navy that lightens a touch towards the middle, and a still
 * field of faint stars. Drawn once when the page opens, never animated (the
 * motion rule), and invisible once you zoom in, where the map fills the
 * canvas: it costs nothing after the first frame.
 */
export function paintSpace(element: HTMLElement): void {
  const width = 1920;
  const height = 1200;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // A fixed seed: the same sky every visit, like a real one.
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < 900; i++) {
    const x = random() * width;
    const y = random() * height;
    // Most stars barely there, a few brighter: a real sky's spread, kept quiet
    // so they never compete with the traffic.
    const bright = random() ** 4;
    const alpha = 0.12 + bright * 0.6;
    const r = 0.45 + bright * 0.9;
    ctx.fillStyle = `rgba(214, 232, 255, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (bright > 0.55) {
      // The brightest few get a soft halo.
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      glow.addColorStop(0, `rgba(170, 210, 255, ${(alpha * 0.35).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(170, 210, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  element.style.background = [
    `url(${canvas.toDataURL('image/png')}) center / cover no-repeat`,
    'radial-gradient(ellipse 70% 65% at 50% 47%, #0a1f36 0%, #05101e 55%, #02060c 100%)',
  ].join(', ');
}
