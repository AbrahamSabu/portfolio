import { describe, expect, it } from 'vitest';
import { guessScreenKind } from './deviceRole';

const guess = (userAgent: string, maxTouchPoints = 0) => guessScreenKind({ userAgent, maxTouchPoints });

describe('guessing what a screen is', () => {
  it('knows TV browsers by their platform', () => {
    expect(guess('Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 94.0.4606.31/7.0 TV Safari/537.36')).toBe('tv');
    expect(guess('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.128 Safari/537.36 WebAppManager')).toBe('tv');
    expect(guess('Mozilla/5.0 (Linux; Android 12; BRAVIA 4K VH2 Build/STT1.211025.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')).toBe('tv');
    expect(guess('Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.0 like Chrome/120.0 Safari/537.36')).toBe('tv');
  });

  it('tells tablets from phones, iPads included (they say Macintosh but have touch)', () => {
    expect(guess('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 5)).toBe('tablet');
    expect(guess('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')).toBe('tablet');
    expect(guess('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')).toBe('phone');
    expect(guess('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('phone');
  });

  it('takes anything else for a laptop, a Mac without touch included', () => {
    expect(guess('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')).toBe('laptop');
    expect(guess('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 0)).toBe('laptop');
  });
});
