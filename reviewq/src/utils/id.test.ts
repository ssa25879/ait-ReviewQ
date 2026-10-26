import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from './id';

describe('newId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('연속 생성한 id는 비어 있지 않고 서로 다르다', () => {
    const ids = Array.from({ length: 100 }, () => newId());
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('crypto.randomUUID를 쓸 수 없으면 대체 id를 돌려준다', () => {
    vi.stubGlobal('crypto', {});
    const a = newId();
    const b = newId();
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});
