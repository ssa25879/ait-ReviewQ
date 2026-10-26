import { describe, expect, it } from 'vitest';
import { META_KEY } from './keys';
import { createMemoryStorage } from './memoryStorage';
import { initMeta } from './meta';

describe('initMeta', () => {
  it('빈 저장소에서 schemaVersion 1·오늘 날짜·installId로 Meta를 만들어 저장한다', async () => {
    const storage = createMemoryStorage();
    const meta = await initMeta({ storage, today: '2026-10-26', newId: () => 'install-1' });

    const expected = { schemaVersion: 1, lastOpenedDate: '2026-10-26', installId: 'install-1' };
    expect(meta).toEqual(expected);
    const { [META_KEY]: raw } = await storage.getItems([META_KEY]);
    expect(JSON.parse(raw!)).toEqual(expected);
  });

  it('재실행하면 저장된 Meta를 그대로 불러오고 installId를 유지한다', async () => {
    const storage = createMemoryStorage();
    const first = await initMeta({ storage, today: '2026-10-26', newId: () => 'install-1' });
    const second = await initMeta({ storage, today: '2026-10-27', newId: () => 'install-2' });

    expect(second).toEqual(first);
    expect(second.installId).toBe('install-1');
  });

  it('저장된 Meta가 손상된 JSON이면 덮어쓰지 않고 오류를 던진다', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({ [META_KEY]: '{broken' });

    await expect(
      initMeta({ storage, today: '2026-10-26', newId: () => 'install-1' }),
    ).rejects.toThrow();
    const { [META_KEY]: raw } = await storage.getItems([META_KEY]);
    expect(raw).toBe('{broken');
  });
});
