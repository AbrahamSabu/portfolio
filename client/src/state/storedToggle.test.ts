import { describe, expect, it } from 'vitest';
import { StoredToggle } from './storedToggle';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

describe('StoredToggle', () => {
  it('starts from the stored choice, else the default', () => {
    expect(new StoredToggle('k', true, memory()).value).toBe(true);
    expect(new StoredToggle('k', true, memory({ k: 'false' })).value).toBe(false);
    expect(new StoredToggle('k', false, memory({ k: 'nonsense' })).value).toBe(false);
  });

  it('remembers changes and tells listeners, once per real change', () => {
    const storage = memory();
    const toggle = new StoredToggle('k', true, storage);
    let calls = 0;
    toggle.subscribe(() => calls++);
    toggle.toggle();
    toggle.set(false);
    expect(toggle.value).toBe(false);
    expect(storage.data.k).toBe('false');
    expect(calls).toBe(1);
  });

  it('works when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const toggle = new StoredToggle('k', true, broken);
    toggle.set(false);
    expect(toggle.value).toBe(false);
  });
});
