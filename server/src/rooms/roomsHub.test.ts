import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_STALENESS, type ClientMessage } from '@watchfloor/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { Hub } from '../hub';
import { TrackStore } from '../trackStore';
import { Rooms } from './rooms';

type Received = { type: string } & Record<string, unknown>;

/** A browser on a real socket that can wait for the next message of a type. */
function browser(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const unread: Received[] = [];
  const waiting: Array<{ type: string; resolve: (m: Received) => void }> = [];
  ws.on('message', (data) => {
    const m = JSON.parse(String(data)) as Received;
    const i = waiting.findIndex((w) => w.type === m.type);
    if (i >= 0) waiting.splice(i, 1)[0]!.resolve(m);
    else unread.push(m);
  });
  return {
    ws,
    send: (m: ClientMessage) => ws.send(JSON.stringify(m)),
    next(type: string): Promise<Received> {
      const i = unread.findIndex((m) => m.type === type);
      if (i >= 0) return Promise.resolve(unread.splice(i, 1)[0]!);
      return new Promise((resolve) => waiting.push({ type, resolve }));
    },
  };
}

describe('the ops room through the hub', () => {
  let server: Server | undefined;
  let hub: Hub | undefined;
  let rooms: Rooms | undefined;

  afterEach(async () => {
    rooms?.stop();
    await hub?.stop();
    await new Promise((r) => server?.close(r));
  });

  it('lets a phone join a main screen and send it a track', async () => {
    server = createServer();
    rooms = new Rooms({ origins: () => ['http://192.168.1.20:8103'] });
    hub = new Hub({
      server, path: '/ws', store: new TrackStore(DEFAULT_STALENESS), tickMs: 1000, staleness: DEFAULT_STALENESS,
      scenario: null, traffic: 'simulated', rooms,
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;

    const main = browser(port);
    await main.next('hello');
    main.send({ type: 'room-open' });
    const room = await main.next('room');
    expect(room).toMatchObject({ role: 'main', origins: ['http://192.168.1.20:8103'] });

    const phone = browser(port);
    await phone.next('hello');
    phone.send({ type: 'room-join', code: room.code as string });
    const seat = await phone.next('room');
    expect(seat).toMatchObject({ role: 'console', code: room.code });

    phone.send({ type: 'room-look', id: 'sim:air-0001' });
    phone.send({ type: 'room-send', id: 'sim:air-0001' });
    expect(await main.next('room-show')).toMatchObject({ id: 'sim:air-0001', from: seat.callsign });

    // The phone's socket closing takes it out of the room's presence.
    let presence = await main.next('room-presence');
    while ((presence.consoles as unknown[]).length === 0) presence = await main.next('room-presence');
    expect(presence.consoles).toEqual([{ callsign: seat.callsign, id: 'sim:air-0001' }]);
    phone.ws.close();
    while ((presence.consoles as unknown[]).length > 0) presence = await main.next('room-presence');
    main.ws.close();
  });
});
