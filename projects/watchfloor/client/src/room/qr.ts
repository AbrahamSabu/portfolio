/**
 * A QR code encoder (ISO/IEC 18004), kept small on purpose: byte mode,
 * error correction level M (a code still reads with about 15% of it
 * damaged or covered: glare on a TV, scan lines) and versions 1-10 (up to
 * 213 bytes, plenty for a join link). Written here instead of added as a
 * dependency: it's about 200 lines, and each part is a classic worth
 * knowing — Reed–Solomon error correction over GF(256), the zigzag
 * placement, and masks scored so a scanner sees an even, finder-free field.
 *
 * Coordinates: x is the column, y the row, modules[y][x] is true when dark.
 */

export interface QrCode {
  version: number;
  /** Modules per side: 21 for version 1, four more for each version after. */
  size: number;
  mask: number;
  modules: boolean[][];
}

export const MAX_VERSION = 10;
/** Error correction codewords per block, and how many blocks, at level M for versions 1-10. */
const EC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** Where alignment patterns are centred (rows and columns alike), versions 1-10. */
const ALIGNMENT: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

/** The QR code for a text (UTF-8). Throws a RangeError past MAX_VERSION's 213 bytes. */
export function encodeQr(text: string): QrCode {
  const bytes = new TextEncoder().encode(text);
  const version = versionFor(bytes.length);
  const codewords = withErrorCorrection(dataCodewords(bytes, version), version);
  const { modules, reserved } = functionPatterns(version);
  placeCodewords(modules, reserved, codewords);

  // Try all eight masks and keep the one a scanner will find easiest.
  let best: { mask: number; modules: boolean[][]; score: number } | undefined;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = modules.map((row) => [...row]);
    applyMask(candidate, reserved, mask);
    drawFormat(candidate, mask);
    const score = penalty(candidate);
    if (!best || score < best.score) best = { mask, modules: candidate, score };
  }
  return { version, size: modules.length, mask: best!.mask, modules: best!.modules };
}

/** The code as an SVG: dark modules as one path, on a light square with the four-module quiet zone scanners need. */
export function qrSvg(code: QrCode, colours = { dark: '#06121F', light: '#F4FAFF' }): string {
  const quiet = 4;
  const side = code.size + quiet * 2;
  let d = '';
  code.modules.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (row[x]) x++;
      d += `M${start + quiet} ${y + quiet}h${x - start}v1h${start - x}z`;
    }
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" aria-hidden="true">` +
    `<rect width="${side}" height="${side}" fill="${colours.light}"/><path d="${d}" fill="${colours.dark}"/></svg>`
  );
}

// Capacity

/** Data and error correction modules: everything that isn't a fixed pattern. */
function rawModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

const totalCodewords = (version: number) => Math.floor(rawModules(version) / 8);

/** Data codewords at level M. */
export const dataCapacity = (version: number) => totalCodewords(version) - EC_PER_BLOCK[version - 1]! * BLOCKS[version - 1]!;

/** Byte mode counts characters in 8 bits up to version 9, 16 from version 10. */
const countBits = (version: number) => (version < 10 ? 8 : 16);

/** The smallest version that holds this many bytes. */
export function versionFor(byteLength: number): number {
  for (let v = 1; v <= MAX_VERSION; v++) {
    if (4 + countBits(v) + 8 * byteLength <= dataCapacity(v) * 8) return v;
  }
  throw new RangeError(`${byteLength} bytes is too long for a version ${MAX_VERSION} QR code`);
}

// Data

/** Mode, count, the bytes, a terminator, then the standard pad bytes up to capacity. */
function dataCodewords(bytes: Uint8Array, version: number): number[] {
  const capacityBits = dataCapacity(version) * 8;
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, countBits(version));
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((w, b) => (w << 1) | b, 0));
  for (let pad = 0xec; words.length < capacityBits / 8; pad ^= 0xec ^ 0x11) words.push(pad);
  return words;
}

/**
 * Splits the data into blocks, adds each block's Reed–Solomon codewords and
 * interleaves them, so a smudge spoils a little of every block rather than
 * all of one.
 */
function withErrorCorrection(data: number[], version: number): number[] {
  const blocks = BLOCKS[version - 1]!;
  const ec = EC_PER_BLOCK[version - 1]!;
  const total = totalCodewords(version);
  const shortBlocks = blocks - (total % blocks);
  const shortData = Math.floor(total / blocks) - ec;
  const divisor = reedSolomonDivisor(ec);
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const length = shortData + (i < shortBlocks ? 0 : 1);
    const block = data.slice(k, k + length);
    k += length;
    dataBlocks.push(block);
    ecBlocks.push(reedSolomonRemainder(block, divisor));
  }
  const out: number[] = [];
  for (let i = 0; i <= shortData; i++) for (const block of dataBlocks) if (i < block.length) out.push(block[i]!);
  for (let i = 0; i < ec; i++) for (const block of ecBlocks) out.push(block[i]!);
  return out;
}

// Reed–Solomon over GF(256), with the field's reducing polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D).

/** Multiplies in GF(256): carry-less multiplication, reduced as it goes. */
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** The generator polynomial (x - a^0)(x - a^1)...(x - a^(degree-1)), highest power first, without its leading 1. */
function reedSolomonDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j]!, root) ^ (j + 1 < degree ? result[j + 1]! : 0);
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** The error correction codewords: the data, times x^degree, modulo the generator. */
export function reedSolomonRemainder(data: number[], divisor: number[] | number): number[] {
  const div = typeof divisor === 'number' ? reedSolomonDivisor(divisor) : divisor;
  const result = new Array<number>(div.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    div.forEach((coefficient, i) => (result[i] = result[i]! ^ gfMultiply(coefficient, factor)));
  }
  return result;
}

// Layout

const grid = (size: number) => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

/**
 * The fixed patterns: finders in three corners, timing lines, alignment
 * patterns, the dark module and version information. `reserved` marks
 * them, plus the format areas (drawn once the mask is chosen), so data
 * goes around them.
 */
export function functionPatterns(version: number): { modules: boolean[][]; reserved: boolean[][] } {
  const size = version * 4 + 17;
  const modules = grid(size);
  const reserved = grid(size);
  const set = (x: number, y: number, dark: boolean) => {
    modules[y]![x] = dark;
    reserved[y]![x] = true;
  };

  // Timing: alternating modules along row 6 and column 6 (the finders cover their ends).
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // Finders: a dark 3x3 core, a light ring, a dark ring, then a light separator.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, ring !== 2 && ring !== 4);
      }
    }
  }
  // Alignment: 5x5 bullseyes on every pair of centres, except under the finders.
  const centres = ALIGNMENT[version - 1]!;
  const last = centres.length - 1;
  centres.forEach((cy, i) =>
    centres.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );
  // Format areas, beside the finders: reserved now, drawn per mask.
  for (let i = 0; i <= 8; i++) {
    reserved[i]![8] = true;
    reserved[8]![i] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8]![size - 1 - i] = true;
    reserved[size - 1 - i]![8] = true;
  }
  set(8, size - 8, true); // always dark
  // Version information (7 and up): two 6x3 blocks by the top-right and bottom-left finders.
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }
  return { modules, reserved };
}

/** The 18 version bits: the version, then a BCH(18,6) code that lets scanners correct misreads. */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

/** The 15 format bits for level M and this mask: BCH(15,5), then XORed so they're never all light. */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // level M is 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** Both copies of the format bits: around the top-left finder, and split between the other two. */
function drawFormat(modules: boolean[][], mask: number): void {
  const size = modules.length;
  const bits = formatBits(mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) modules[i]![8] = bit(i);
  modules[7]![8] = bit(6);
  modules[8]![8] = bit(7);
  modules[8]![7] = bit(8);
  for (let i = 9; i < 15; i++) modules[8]![14 - i] = bit(i);
  for (let i = 0; i < 8; i++) modules[8]![size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i]![8] = bit(i);
}

/**
 * The zigzag: two columns at a time from the bottom-right corner, up then
 * down, skipping the vertical timing line, each codeword's bits most
 * significant first. Modules left over stay light.
 */
export function placeCodewords(modules: boolean[][], reserved: boolean[][], codewords: number[]): void {
  const size = modules.length;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (reserved[y]![x] || i >= codewords.length * 8) continue;
        modules[y]![x] = ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }
}

/** The eight mask patterns: a data module flips where its pattern says. */
export const MASKS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export function applyMask(modules: boolean[][], reserved: boolean[][], mask: number): void {
  const flips = MASKS[mask]!;
  modules.forEach((row, y) => row.forEach((dark, x) => {
    if (!reserved[y]![x] && flips(x, y)) row[x] = !dark;
  }));
}

// Mask scoring: the standard's four penalties. Lower reads better.

const FINDER_LIKE = [true, false, true, true, true, false, true];

function linePenalty(line: boolean[]): number {
  let score = 0;
  // Runs of five or more of one colour.
  let run = 1;
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === line[i - 1]) {
      run++;
      continue;
    }
    if (run >= 5) score += 3 + (run - 5);
    run = 1;
  }
  // Something that looks like a finder (1:1:3:1:1) with four light modules on a side.
  const light = (i: number) => i < 0 || i >= line.length || !line[i];
  for (let i = 0; i + 7 <= line.length; i++) {
    if (!FINDER_LIKE.every((dark, k) => line[i + k] === dark)) continue;
    const before = [1, 2, 3, 4].every((k) => light(i - k));
    const after = [7, 8, 9, 10].every((k) => light(i + k));
    if (before || after) score += 40;
  }
  return score;
}

export function penalty(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;
  for (let i = 0; i < size; i++) {
    score += linePenalty(modules[i]!);
    score += linePenalty(modules.map((row) => row[i]!));
  }
  // Every 2x2 block of one colour.
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const c = modules[y]![x];
      if (c === modules[y]![x + 1] && c === modules[y + 1]![x] && c === modules[y + 1]![x + 1]) score += 3;
    }
  }
  // How far dark is from half, in steps of 5%.
  const dark = modules.reduce((n, row) => n + row.filter(Boolean).length, 0);
  const total = size * size;
  score += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}
