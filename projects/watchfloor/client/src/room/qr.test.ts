import { describe, expect, it } from 'vitest';
import {
  MASKS,
  applyMask,
  dataCapacity,
  encodeQr,
  formatBits,
  functionPatterns,
  qrSvg,
  reedSolomonRemainder,
  versionBits,
  versionFor,
  type QrCode,
} from './qr';

/**
 * The standard's block table for level M (ISO/IEC 18004 table 9), copied
 * here independently of the encoder: groups of [blocks, codewords per
 * block, data codewords per block].
 */
const BLOCK_TABLE_M: Array<Array<[number, number, number]>> = [
  [[1, 26, 16]],
  [[1, 44, 28]],
  [[1, 70, 44]],
  [[2, 50, 32]],
  [[2, 67, 43]],
  [[4, 43, 27]],
  [[4, 49, 31]],
  [[2, 60, 38], [2, 61, 39]],
  [[3, 58, 36], [2, 59, 37]],
  [[4, 69, 43], [1, 70, 44]],
];

/** Format bits for level M, masks 0-7, as the standard lists them. */
const FORMAT_M = [
  0b101010000010010, 0b101000100100101, 0b101111001111100, 0b101101101001011,
  0b100010111111001, 0b100000011001110, 0b100111110010111, 0b100101010100000,
];

const at = (code: QrCode, x: number, y: number) => code.modules[y]![x]!;

/** Reads the format bits back from both copies. */
function readFormat(code: QrCode): [number, number] {
  const { size } = code;
  const first = [0, 1, 2, 3, 4, 5].map((i) => at(code, 8, i))
    .concat([at(code, 8, 7), at(code, 8, 8), at(code, 7, 8)])
    .concat([9, 10, 11, 12, 13, 14].map((i) => at(code, 14 - i, 8)));
  const second = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => at(code, size - 1 - i, 8))
    .concat([8, 9, 10, 11, 12, 13, 14].map((i) => at(code, 8, size - 15 + i)));
  const value = (bits: boolean[]) => bits.reduce((n, dark, i) => n | (Number(dark) << i), 0);
  return [value(first), value(second)];
}

/**
 * Takes a code apart the way a scanner would: format, un-mask, read the
 * zigzag, de-interleave by the standard's block table, check each block's
 * error correction, then decode byte mode.
 */
function readBack(code: QrCode): string {
  const [format] = readFormat(code);
  const mask = FORMAT_M.indexOf(format);
  expect(mask).toBeGreaterThanOrEqual(0);
  const { reserved } = functionPatterns(code.version);
  const modules = code.modules.map((row) => [...row]);
  applyMask(modules, reserved, mask); // XOR again undoes it

  const bits: number[] = [];
  for (let right = code.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < code.size; step++) {
      const y = upward ? code.size - 1 - step : step;
      for (const x of [right, right - 1]) if (!reserved[y]![x]) bits.push(Number(modules[y]![x]));
    }
  }
  const words: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((w, b) => (w << 1) | b, 0));

  const blocks = BLOCK_TABLE_M[code.version - 1]!.flatMap(([n, total, data]) => Array.from({ length: n }, () => ({ total, data })));
  expect(words.length).toBe(blocks.reduce((n, b) => n + b.total, 0));
  const dataOf = blocks.map(() => [] as number[]);
  const ecOf = blocks.map(() => [] as number[]);
  let k = 0;
  for (let i = 0; i < Math.max(...blocks.map((b) => b.data)); i++) blocks.forEach((b, j) => i < b.data && dataOf[j]!.push(words[k++]!));
  for (let i = 0; i < blocks[0]!.total - blocks[0]!.data; i++) blocks.forEach((_, j) => ecOf[j]!.push(words[k++]!));
  dataOf.forEach((data, j) => expect(reedSolomonRemainder(data, ecOf[j]!.length)).toEqual(ecOf[j]));

  const stream = dataOf.flat().flatMap((w) => [7, 6, 5, 4, 3, 2, 1, 0].map((s) => (w >>> s) & 1));
  const take = (n: number) => stream.splice(0, n).reduce((v, b) => (v << 1) | b, 0);
  expect(take(4)).toBe(0b0100); // byte mode
  const length = take(code.version < 10 ? 8 : 16);
  return new TextDecoder().decode(Uint8Array.from({ length }, () => take(8)));
}

describe('QR code parts', () => {
  it('computes Reed–Solomon codewords as the worked example does', () => {
    // "HELLO WORLD" at 1-M, from Thonky's QR code tutorial.
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(reedSolomonRemainder(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('makes the format and version bits the standard lists', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(formatBits)).toEqual(FORMAT_M);
    expect([7, 8, 9, 10].map(versionBits)).toEqual([0x07c94, 0x085bc, 0x09a99, 0x0a4d3]);
  });

  it('holds as many bytes per version as the standard says', () => {
    const bytes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => Math.floor((dataCapacity(v) * 8 - 4 - (v < 10 ? 8 : 16)) / 8));
    expect(bytes).toEqual([14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
    expect(versionFor(14)).toBe(1);
    expect(versionFor(15)).toBe(2);
    expect(versionFor(213)).toBe(10);
    expect(() => versionFor(214)).toThrow(RangeError);
  });

  it('has eight different masks', () => {
    const signatures = MASKS.map((m) => Array.from({ length: 36 }, (_, i) => Number(m(i % 6, Math.floor(i / 6)))).join(''));
    expect(new Set(signatures).size).toBe(8);
  });
});

describe('encodeQr', () => {
  const link = 'http://192.168.1.20:8103/console.html?room=K7QX';

  it('picks the smallest version and draws the fixed patterns', () => {
    const code = encodeQr(link);
    expect(code.version).toBe(4);
    expect(code.size).toBe(33);
    const { size } = code;
    // Each finder: dark border, light ring, dark 3x3 centre, and a light separator outside.
    for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
          expect(at(code, ox! + x, oy! + y)).toBe(ring !== 2);
        }
      }
    }
    for (let i = 0; i < 8; i++) {
      expect(at(code, 7, i)).toBe(false);
      expect(at(code, i, 7)).toBe(false);
      expect(at(code, size - 8, i)).toBe(false);
      expect(at(code, 7, size - 1 - i)).toBe(false);
    }
    // Timing lines alternate, dark on even positions.
    for (let i = 8; i < size - 8; i++) {
      expect(at(code, i, 6)).toBe(i % 2 === 0);
      expect(at(code, 6, i)).toBe(i % 2 === 0);
    }
    expect(at(code, 8, size - 8)).toBe(true); // the dark module
    // Version 4 has one alignment pattern, centred at (26, 26).
    expect([at(code, 26, 26), at(code, 25, 26), at(code, 24, 26)]).toEqual([true, false, true]);
  });

  it('writes the same format bits in both places, naming the mask it chose', () => {
    const code = encodeQr(link);
    const [first, second] = readFormat(code);
    expect(first).toBe(second);
    expect(first).toBe(FORMAT_M[code.mask]);
  });

  it('carries version information from version 7, in both blocks', () => {
    const code = encodeQr('x'.repeat(110));
    expect(code.version).toBe(7);
    const bits = versionBits(7);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      expect(at(code, code.size - 11 + (i % 3), Math.floor(i / 3))).toBe(dark);
      expect(at(code, Math.floor(i / 3), code.size - 11 + (i % 3))).toBe(dark);
    }
  });

  it('reads back to the same text at every version, error correction intact', () => {
    const texts = [
      'K7QX',
      link,
      'https://watchfloor.example.org/console.html?room=BCDF',
      `http://[fd00::20]:8103/console.html?room=Z9Z9#${'é'.repeat(30)}`,
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => 'w'.repeat([14, 26, 42, 62, 84, 106, 122, 152, 180, 213][v - 1]!)),
    ];
    const versions = new Set<number>();
    for (const text of texts) {
      const code = encodeQr(text);
      versions.add(code.version);
      expect(readBack(code)).toBe(text);
    }
    expect(versions.size).toBe(10);
  });

  it('draws as SVG with a quiet zone', () => {
    const svg = qrSvg(encodeQr('K7QX'));
    expect(svg).toContain('viewBox="0 0 29 29"'); // 21 modules plus 4 each side
    expect(svg).toMatch(/<path d="M4 4h7v1h-7z/); // the top-left finder's top edge
  });
});
