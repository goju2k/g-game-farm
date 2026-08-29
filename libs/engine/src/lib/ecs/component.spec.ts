import { defineComponent } from './component.js';

describe('defineComponent', () => {
  it('assigns increasing ids across definitions', () => {
    const a = defineComponent<number>('component.spec:A');
    const b = defineComponent<number>('component.spec:B');
    expect(b.id).toBe(a.id + 1);
  });

  it('preserves the given name', () => {
    const type = defineComponent<number>('component.spec:Named');
    expect(type.name).toBe('component.spec:Named');
  });

  it('rejects duplicate names', () => {
    defineComponent<number>('component.spec:Dup');
    expect(() => defineComponent<number>('component.spec:Dup')).toThrow();
  });
});
