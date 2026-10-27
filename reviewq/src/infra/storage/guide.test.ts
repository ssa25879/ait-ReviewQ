import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from './StorageAdapter';
import { readGuideSeen, saveGuideSeen } from './guide';
import { GUIDE_KEY } from './keys';
import { createMemoryStorage } from './memoryStorage';

describe('가이드 본 기록', () => {
  it('저장 전에는 false, 저장 후에는 true', async () => {
    const storage = createMemoryStorage();
    expect(await readGuideSeen(storage)).toBe(false);
    await saveGuideSeen(storage);
    expect(await readGuideSeen(storage)).toBe(true);
    expect((await storage.getItems([GUIDE_KEY]))[GUIDE_KEY]).toBe('true');
  });

  it('읽기에 실패하면 안 본 것으로 본다', async () => {
    const failing: StorageAdapter = { ...createMemoryStorage(), getItems: () => Promise.reject(new Error('읽기 실패')) };
    expect(await readGuideSeen(failing)).toBe(false);
  });
});
