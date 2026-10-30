import { describe, expect, it } from 'vitest';
import { pickBritishVoice } from './voice';

describe('pickBritishVoice', () => {
  it("prefers a British man's natural voice, then any British voice", () => {
    const voices = [
      { name: 'Microsoft David - English (United States)', lang: 'en-US' },
      { name: 'Microsoft Hazel - English (United Kingdom)', lang: 'en-GB' },
      { name: 'Microsoft George - English (United Kingdom)', lang: 'en-GB' },
      { name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    ];
    expect(pickBritishVoice(voices)?.name).toContain('Ryan');
    expect(pickBritishVoice(voices.slice(0, 2))?.name).toContain('Hazel');
    expect(pickBritishVoice(voices.slice(0, 1))).toBeNull();
  });
});
