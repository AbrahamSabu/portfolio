import { describe, expect, it } from 'vitest';
import { closeHint } from './closeButton';

describe('closeHint', () => {
  it('names the shortcut for the platform', () => {
    expect(closeHint('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', false)).toBe('Press Ctrl+W to close this tab');
    expect(closeHint('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605', false)).toBe('Press ⌘W to close this tab');
  });

  it('has no shortcut to offer on a touch screen', () => {
    expect(closeHint('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', true)).toBe('Close this tab from your browser');
    expect(closeHint('Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile', true)).toBe('Close this tab from your browser');
  });
});
