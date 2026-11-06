/** A 16-bit PCM WAV file from channels of samples (-1..1), interleaved: a render you can listen to. */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const frames = channels[0]?.length ?? 0;
  const blockAlign = channels.length * 2;
  const bytes = new Uint8Array(44 + frames * blockAlign);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + frames * blockAlign, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // format chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, frames * blockAlign, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (const channel of channels) {
      const s = Math.max(-1, Math.min(1, channel[i] ?? 0));
      view.setInt16(offset, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
      offset += 2;
    }
  }
  return bytes;
}
