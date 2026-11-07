import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogClient } from './catalogClient';
import { ServerOrBrowserCatalog } from './serverOrBrowser';

const EMPTY = { v: 1, groups: [{ group: 'stations', status: 'ok', fetchedAt: 1, sats: [] }] };

function answer(etag: string): Response {
  return new Response(JSON.stringify(EMPTY), { headers: { 'content-type': 'application/json', etag } });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CatalogClient', () => {
  it('fetches once however often it is started, and again only when its time comes', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => answer('"a"'));
    vi.stubGlobal('fetch', fetch);
    const loaded = vi.fn();
    const client = new CatalogClient(loaded, () => {});
    client.start();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(loaded).toHaveBeenCalledTimes(1);
    // Half an hour on, a re-check; the same ETag isn't handed over again.
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(loaded).toHaveBeenCalledTimes(1);
    client.stop();
  });

  it('drops an answer that arrives after it was stopped, and asks nothing more', async () => {
    vi.useFakeTimers();
    let release: (r: Response) => void = () => {};
    const fetch = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    vi.stubGlobal('fetch', fetch);
    const loaded = vi.fn();
    const client = new CatalogClient(loaded, () => {});
    client.start();
    client.stop();
    release(answer('"a"'));
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
    expect(loaded).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    // Shown again: one re-check straight away.
    fetch.mockImplementation(async () => answer('"a"'));
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(loaded).toHaveBeenCalledTimes(1);
    client.stop();
  });
});

describe('ServerOrBrowserCatalog', () => {
  it('fetches satellites itself when the server has them switched off (404)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    const browser = { start: vi.fn(), stop: vi.fn(), status: 'ready' as const, unavailableText: 'not available' };
    const factory = vi.fn(async () => browser);
    const catalog = new ServerOrBrowserCatalog(() => {}, () => {}, factory);
    catalog.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(browser.start).toHaveBeenCalledTimes(1);
    expect(catalog.status).toBe('ready');
  });

  it('stays with the server through any other failure', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 502 })));
    const factory = vi.fn();
    const catalog = new ServerOrBrowserCatalog(() => {}, () => {}, factory);
    catalog.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(factory).not.toHaveBeenCalled();
    expect(catalog.status).toBe('unavailable');
    catalog.stop();
  });
});
