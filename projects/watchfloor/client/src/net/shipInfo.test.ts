import { describe, expect, it } from 'vitest';
import { parseCommonsAnswer, parseShipAnswer, plainText, sameName, shipQuery } from './shipInfo';

const row = (fields: Record<string, string>) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v }]));

describe('shipQuery', () => {
  it('asks by IMO and MMSI, and only for well-formed numbers', () => {
    const q = shipQuery('211211111', 9781865)!;
    expect(q).toContain('wdt:P458 "9781865"');
    expect(q).toContain('wdt:P587 "211211111"');
    expect(shipQuery('211211111')).not.toContain('P458');
    expect(shipQuery('21121111"')).toBeNull();
    expect(shipQuery('211211111', 12)).toBeNull();
  });
});

describe('parseShipAnswer', () => {
  const aida = {
    results: {
      bindings: [
        row({
          item: 'http://www.wikidata.org/entity/Q24940443',
          itemLabel: 'AIDAnova',
          how: 'imo',
          image: 'http://commons.wikimedia.org/wiki/Special:FilePath/AIDAnova%20%282018%29.jpg',
          operatorLabel: 'AIDA Cruises',
          inception: '2018-01-01T00:00:00Z',
        }),
        row({ item: 'http://www.wikidata.org/entity/Q24940443', itemLabel: 'AIDAnova', how: 'imo', service: '2018-12-12T00:00:00Z' }),
      ],
    },
  };

  it('reads the ship, its operator, year and photo file', () => {
    expect(parseShipAnswer(aida, 'AIDANOVA')).toEqual({
      name: 'AIDAnova',
      operator: 'AIDA Cruises',
      built: 2018,
      image: 'AIDAnova (2018).jpg',
    });
  });

  it('trusts an MMSI match only when the name agrees, as MMSIs pass between ships', () => {
    const byMmsi = { results: { bindings: [row({ item: 'http://www.wikidata.org/entity/Q1', itemLabel: 'MV Doc Maynard', how: 'mmsi' })] } };
    expect(parseShipAnswer(byMmsi, 'DOC MAYNARD')?.name).toBe('MV Doc Maynard');
    expect(parseShipAnswer(byMmsi, 'SOMETHING ELSE')).toBeNull();
    expect(parseShipAnswer(byMmsi, undefined)).toBeNull();
  });

  it('drops labels Wikidata has only as ids, and copes with no answer', () => {
    const bare = { results: { bindings: [row({ item: 'x', itemLabel: 'Q11706864', how: 'imo', operatorLabel: 'Q42' })] } };
    expect(parseShipAnswer(bare, 'X')).toEqual({});
    expect(parseShipAnswer({ results: { bindings: [] } }, 'X')).toBeNull();
    expect(parseShipAnswer(null, 'X')).toBeNull();
  });
});

describe('sameName', () => {
  it('ignores prefixes, case and punctuation', () => {
    expect(sameName('HMS Queen Elizabeth', 'QUEEN ELIZABETH')).toBe(true);
    expect(sameName('Pride of Kent', 'PRIDE OF KENT')).toBe(true);
    expect(sameName('Spirit of Britain', 'PRIDE OF KENT')).toBe(false);
    expect(sameName('', 'X')).toBe(false);
  });
});

describe('parseCommonsAnswer', () => {
  const answer = {
    query: {
      pages: {
        '-1': {
          imageinfo: [
            {
              thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/AIDAnova.jpg/420px-AIDAnova.jpg',
              thumbwidth: 420,
              thumbheight: 280,
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:AIDAnova.jpg',
              extmetadata: {
                Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Example">Jane &amp; Co</a>' },
                LicenseShortName: { value: 'CC BY-SA 4.0' },
              },
            },
          ],
        },
      },
    },
  };

  it('gives the thumbnail, the file page, and author with licence', () => {
    expect(parseCommonsAnswer(answer)).toEqual({
      src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/AIDAnova.jpg/420px-AIDAnova.jpg',
      width: 420,
      height: 280,
      link: 'https://commons.wikimedia.org/wiki/File:AIDAnova.jpg',
      credit: 'Jane & Co, CC BY-SA 4.0',
      source: 'Wikimedia Commons',
    });
  });

  it('refuses images or pages from anywhere else', () => {
    const info = answer.query.pages['-1'].imageinfo[0]!;
    const withInfo = (extra: object) => ({ query: { pages: { '1': { imageinfo: [{ ...info, ...extra }] } } } });
    expect(parseCommonsAnswer(withInfo({ thumburl: 'https://evil.example/x.jpg' }))).toBeNull();
    expect(parseCommonsAnswer(withInfo({ thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b3/K.jpg/500px-K.jpg' }))?.src).toBe(
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b3/K.jpg/500px-K.jpg',
    );
    expect(parseCommonsAnswer(withInfo({ descriptionurl: 'javascript:alert(1)' }))).toBeNull();
    expect(parseCommonsAnswer({ query: { pages: { '-1': { missing: '' } } } })).toBeNull();
  });

  it('reads plain text out of HTML', () => {
    expect(plainText('<span>A&nbsp;B</span> <i>C</i>')).toBe('A B C');
  });
});
