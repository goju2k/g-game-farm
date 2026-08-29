import { LayerStack } from './layers.js';

describe('LayerStack', () => {
  it('rejects an empty layer list', () => {
    expect(() => new LayerStack([])).toThrow();
  });

  it('rejects duplicate ids', () => {
    expect(() => new LayerStack([{ id: 'a' }, { id: 'a' }])).toThrow();
  });

  it('get() returns the config for a known id', () => {
    const stack = new LayerStack([{ id: 'gameplay', pixelSnap: true }]);
    expect(stack.get('gameplay')).toEqual({ id: 'gameplay', pixelSnap: true });
  });

  it('get() throws for an unknown id', () => {
    const stack = new LayerStack([{ id: 'gameplay' }]);
    expect(() => stack.get('background')).toThrow();
  });

  it('iterates in the array order it was constructed with', () => {
    const stack = new LayerStack([{ id: 'background' }, { id: 'gameplay' }, { id: 'foreground' }]);
    expect([...stack].map((layer) => layer.id)).toEqual(['background', 'gameplay', 'foreground']);
  });
});
