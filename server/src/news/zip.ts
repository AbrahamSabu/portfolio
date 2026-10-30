import { promisify } from 'node:util';
import zlib from 'node:zlib';

const inflateRaw = promisify(zlib.inflateRaw);

/** A GDELT batch's article file unzips to about 20 MB; anything far bigger is not one. */
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;

/**
 * The first file in a zip archive, as bytes. GDELT publishes each 15-minute
 * batch as a zip holding one CSV, and Node has no zip reader: a whole
 * dependency for one file per batch isn't worth it. Sizes are read from the
 * central directory (at the end), because a local header may leave them 0
 * and put them after the data instead. Inflating runs on libuv's thread
 * pool: a batch's article file is about 20 MB, too much for the event loop.
 */
export async function firstZipEntry(zip: Buffer): Promise<Buffer> {
  // End of central directory: signature, then the directory's offset at +16.
  // It's the last 22 bytes unless the archive has a comment.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip archive');
  if (zip.readUInt16LE(end + 10) === 0) throw new Error('empty zip archive');
  const dir = zip.readUInt32LE(end + 16);
  if (dir + 46 > zip.length || zip.readUInt32LE(dir) !== 0x02014b50) throw new Error('bad zip directory');
  const method = zip.readUInt16LE(dir + 10);
  const compressedSize = zip.readUInt32LE(dir + 20);
  const size = zip.readUInt32LE(dir + 24);
  const local = zip.readUInt32LE(dir + 42);
  if (local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) throw new Error('bad zip entry');
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  if (start + compressedSize > zip.length) throw new Error('truncated zip entry');
  const data = zip.subarray(start, start + compressedSize);
  if (size > MAX_ENTRY_BYTES) throw new Error('zip entry too large');
  if (method === 0) return Buffer.from(data);
  if (method !== 8) throw new Error(`unsupported zip compression ${method}`);
  // maxOutputLength guards against a zip bomb claiming a small size.
  return inflateRaw(data, { maxOutputLength: Math.max(size, 1) });
}
