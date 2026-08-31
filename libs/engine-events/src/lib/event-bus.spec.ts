import { defineEventType, TickEventBus } from './event-bus.js';

describe('TickEventBus', () => {
  it('reads back what was emitted, independently per event type', () => {
    const Ping = defineEventType<{ n: number }>('event-bus.spec:Ping');
    const Pong = defineEventType<{ n: number }>('event-bus.spec:Pong');
    const bus = new TickEventBus();

    bus.emit(Ping, { n: 1 });
    bus.emit(Ping, { n: 2 });
    bus.emit(Pong, { n: 100 });

    expect(bus.read(Ping)).toEqual([{ n: 1 }, { n: 2 }]);
    expect(bus.read(Pong)).toEqual([{ n: 100 }]);
  });

  it('returns an empty array (not undefined) for a type that was never emitted', () => {
    const Unused = defineEventType<{ n: number }>('event-bus.spec:Unused');
    const bus = new TickEventBus();

    expect(bus.read(Unused)).toEqual([]);
  });

  it('clear() empties every buffer', () => {
    const Ping = defineEventType<{ n: number }>('event-bus.spec:ClearPing');
    const bus = new TickEventBus();

    bus.emit(Ping, { n: 1 });
    bus.clear();

    expect(bus.read(Ping)).toEqual([]);
  });
});
