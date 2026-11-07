import { describe, expect, it } from 'vitest';
import { ALERT_LIFE_MS, AlertLives, LINGER_MS } from './alertLife';

describe('AlertLives', () => {
  it('lets a card go once its life is up, and only once', () => {
    const lives = new AlertLives(ALERT_LIFE_MS);
    lives.start('a', 0);
    expect(lives.due(ALERT_LIFE_MS - 1)).toEqual([]);
    expect(lives.due(ALERT_LIFE_MS)).toEqual(['a']);
    expect(lives.due(ALERT_LIFE_MS + 5_000)).toEqual([]);
    expect(lives.size).toBe(0);
  });

  it('keeps a card the reader is on, then gives it a little longer', () => {
    const lives = new AlertLives(10_000);
    lives.start('a', 0);
    // Held from 8 s to 30 s: never due meanwhile.
    for (let t = 8_000; t <= 30_000; t += 500) {
      lives.hold('a', t);
      expect(lives.due(t)).toEqual([]);
    }
    expect(lives.due(30_000 + LINGER_MS - 1)).toEqual([]);
    expect(lives.due(30_000 + LINGER_MS)).toEqual(['a']);
  });

  it('never shortens a life by holding it early', () => {
    const lives = new AlertLives(10_000);
    lives.start('a', 0);
    lives.hold('a', 1_000);
    expect(lives.due(9_999)).toEqual([]);
    expect(lives.due(10_000)).toEqual(['a']);
  });

  it('stops every clock while the page is out of sight', () => {
    const lives = new AlertLives(10_000);
    lives.start('a', 0);
    lives.start('b', 4_000);
    lives.pause(5_000);
    expect(lives.due(60_000)).toEqual([]);
    lives.resume(65_000);
    // a had 5 s left and b 9 s when the page was hidden.
    expect(lives.due(69_999)).toEqual([]);
    expect(lives.due(70_000)).toEqual(['a']);
    expect(lives.due(74_000)).toEqual(['b']);
  });

  it('restarts a card that comes back, and forgets one that went', () => {
    const lives = new AlertLives(10_000);
    lives.start('a', 0);
    lives.start('b', 0);
    lives.forget('b');
    lives.start('a', 8_000);
    expect(lives.due(12_000)).toEqual([]);
    expect(lives.due(18_000)).toEqual(['a']);
  });
});
