import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  batchUrls,
  cleanHeadline,
  cleanPlace,
  decodeEntities,
  importanceOf,
  kindOf,
  parseArticles,
  parseEvents,
  parseLastUpdate,
  placeOf,
  politicalScore,
  selectStories,
  stampsBefore,
  stampTime,
} from './gdelt';
import { firstZipEntry } from './zip';

const fixture = (name: string) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const STAMP = '20261030121500';

describe('GDELT batches', () => {
  it('finds the newest batch in lastupdate.txt and names its files', () => {
    const text = [
      '73139 0524 http://data.gdeltproject.org/gdeltv2/20261030121500.export.CSV.zip',
      '100143 3cc9 http://data.gdeltproject.org/gdeltv2/20261030121500.mentions.CSV.zip',
      '4755743 3b58 http://data.gdeltproject.org/gdeltv2/20261030121500.gkg.csv.zip',
    ].join('\n');
    expect(parseLastUpdate(text)).toBe(STAMP);
    expect(parseLastUpdate('Please limit requests')).toBeNull();
    expect(batchUrls(STAMP)).toEqual({
      events: 'https://data.gdeltproject.org/gdeltv2/20261030121500.export.CSV.zip',
      articles: 'https://data.gdeltproject.org/gdeltv2/20261030121500.gkg.csv.zip',
    });
    expect(() => batchUrls('../etc')).toThrow();
  });

  it('counts back in 15-minute steps, across midnight', () => {
    expect(stampTime(STAMP)).toBe(Date.UTC(2026, 9, 30, 12, 15));
    expect(stampsBefore('20261030001500', 2)).toEqual(['20261030000000', '20261029234500']);
  });
});

describe('selectStories (a real batch)', () => {
  const events = parseEvents(fixture(`${STAMP}.export.CSV`).toString('utf8'));
  const articles = parseArticles(fixture(`${STAMP}.gkg.csv`).toString('utf8'));
  const stories = selectStories(events, articles, stampTime(STAMP));
  const find = (start: string) => stories.find((s) => s.headline.startsWith(start));

  it('keeps the political articles and drops the rest', () => {
    expect(articles.size).toBe(9);
    expect(stories.map((s) => s.headline.slice(0, 30)).sort()).toEqual([
      'INDIA Bloc Stages Massive Rall',
      'Iraqi Judiciary Issues Arrest ',
      'NATO supreme commander reveals',
      'Netanyahu Bloc Falls Short of ',
      'PM Modi to visit Brussels in D',
      'Two Russian fighter jets destr',
    ]);
    // The crash, the company results and the opera are gone.
    expect(stories.some((s) => /helicopter|Dixon|Carmen/.test(s.headline))).toBe(false);
  });

  it('places a story where the article first says, by name', () => {
    expect(find('Netanyahu Bloc')).toMatchObject({ place: 'Tel Aviv, Israel', kind: 'election', outlet: 'thenorthlines.com' });
    expect(find('Two Russian fighter jets')).toMatchObject({ kind: 'conflict' });
    expect(find('PM Modi to visit Brussels')).toMatchObject({ kind: 'diplomacy' });
    // The article says "Russian"; the batch's own country events name the country.
    expect(find('NATO supreme commander')?.place).toBe('Russia');
  });

  it('puts the most political first and stamps every story with the batch time', () => {
    const scores = stories.map((s) => s.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(stories.every((s) => s.publishedAt === Date.UTC(2026, 9, 30, 12, 15))).toBe(true);
    expect(stories.every((s) => s.url.startsWith('http'))).toBe(true);
  });

  it('shows a story carried word for word by two sites once', () => {
    const one = stories[0]!;
    const twice = new Map(articles);
    const copy = 'https://example.org/copy';
    twice.set(copy, { ...articles.get(one.url)!, url: copy });
    const events2 = [...events, ...events.filter((e) => e.url === one.url).map((e) => ({ ...e, id: `${e.id}x`, url: copy }))];
    const again = selectStories(events2, twice, 0);
    expect(again.filter((s) => s.headline === one.headline)).toHaveLength(1);
    // ...and the second site counts as coverage.
    expect(again.find((s) => s.headline === one.headline)!.importance).toBeGreaterThan(one.importance!);
  });

  it('gives every story an importance', () => {
    expect(stories.every((s) => Number.isInteger(s.importance) && s.importance! > 0)).toBe(true);
  });
});

describe('importanceOf', () => {
  it('grows with coverage, on a log scale', () => {
    const base = importanceOf(20, 1, 1, 1);
    expect(importanceOf(20, 4, 1, 1)).toBeGreaterThan(base);
    expect(importanceOf(20, 1, 4, 1)).toBeGreaterThan(base);
    expect(importanceOf(20, 1, 1, 3)).toBeGreaterThan(base);
    // One more source matters to a little-covered story, hardly to a huge one.
    expect(importanceOf(20, 2, 1, 1) - base).toBeGreaterThan(importanceOf(20, 41, 1, 1) - importanceOf(20, 40, 1, 1));
    expect(importanceOf(20, 1000, 1000, 1)).toBeLessThan(150);
  });

  it('counts how political, but caps it, so coverage decides between political stories', () => {
    expect(importanceOf(28, 1, 1, 1)).toBeGreaterThan(importanceOf(10, 1, 1, 1));
    expect(importanceOf(60, 1, 1, 1)).toBe(importanceOf(30, 1, 1, 1));
  });
});

describe('scoring and kinds', () => {
  const themes = (...names: string[]) => new Map(names.map((n) => [n, 1]));

  it('scores political themes up and other subjects down', () => {
    expect(politicalScore(themes('ELECTION', 'LEGISLATION', 'LEADER'))).toBe(5);
    expect(politicalScore(themes('ELECTION', 'SPORTS'))).toBe(-1);
  });

  it('picks the kind the article mentions most', () => {
    expect(kindOf(new Map([['ELECTION', 3], ['ARMEDCONFLICT', 1]]))).toBe('election');
    expect(kindOf(new Map([['ELECTION', 1], ['ARMEDCONFLICT', 1]]))).toBe('conflict');
    expect(kindOf(themes('LEADER'))).toBe('politics');
  });

  it('prefers a city to the middle of the country first named', () => {
    const israel = { name: 'Israel', type: 1, country: 'IS', lat: 31.5, lon: 34.75 };
    const telAviv = { name: 'Tel Aviv, Tel Aviv, Israel', type: 4, country: 'IS', lat: 32.07, lon: 34.77 };
    const cairo = { name: 'Cairo, Al Qahirah, Egypt', type: 4, country: 'EG', lat: 30.05, lon: 31.25 };
    expect(placeOf([israel, cairo, telAviv])).toBe(telAviv);
    expect(placeOf([israel, cairo])).toBe(israel);
    expect(placeOf([])).toBeNull();
  });
});

describe('text clean-up', () => {
  it('decodes the entities page titles arrive with', () => {
    expect(decodeEntities('Profit &#x20B9;411 Crore &amp; more &#39;so&#39; &bogus;')).toBe("Profit ₹411 Crore & more 'so' &bogus;");
  });

  it("drops the outlet's name from the end of a headline, and nothing else", () => {
    expect(cleanHeadline('Ethiopia receives first Su-35s - DefenceWeb', 'defenceweb.co.za')).toBe('Ethiopia receives first Su-35s');
    expect(cleanHeadline('Children remain in captivity – THISDAYLIVE', 'thisdaylive.com')).toBe('Children remain in captivity');
    expect(cleanHeadline('LA has a law on vapes | Opinion', 'latimes.com')).toBe('LA has a law on vapes | Opinion');
    expect(cleanHeadline('Ceasefire holds - for now', 'bbc.co.uk')).toBe('Ceasefire holds - for now');
  });

  it('tidies GDELT place names', () => {
    expect(cleanPlace('Warsaw, (PL67), Poland')).toBe('Warsaw, Poland');
    expect(cleanPlace('Gaza, Israel (General), Israel')).toBe('Gaza, Israel');
  });
});

describe('firstZipEntry', () => {
  it('reads a deflated entry and a stored one behind a comment', async () => {
    expect((await firstZipEntry(fixture(`${STAMP}.export.CSV.zip`))).equals(fixture(`${STAMP}.export.CSV`))).toBe(true);
    expect((await firstZipEntry(fixture('stored-with-comment.zip'))).toString()).toBe('hello, watchfloor\n');
  });

  it('refuses what is not a zip, or is cut short', async () => {
    await expect(firstZipEntry(Buffer.from('Please limit requests to one every 5 seconds'))).rejects.toThrow();
    const zip = fixture(`${STAMP}.export.CSV.zip`);
    await expect(firstZipEntry(zip.subarray(0, zip.length - 30))).rejects.toThrow();
  });
});
