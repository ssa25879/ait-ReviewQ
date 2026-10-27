import { describe, expect, it } from 'vitest';
import { META_KEY } from './keys';
import { createMemoryStorage } from './memoryStorage';
import type { StorageAdapter } from './StorageAdapter';
import { initMeta, migrateMeta, recordOpened, saveLastOpenedDate } from './meta';

// 정상 Meta를 기대하는 테스트용
async function okMeta(storage: StorageAdapter, today: string, id: string) {
  const result = await initMeta({ storage, today, newId: () => id });
  if (!result.ok) throw new Error('Meta 손상');
  return result.meta;
}

describe('initMeta', () => {
  it('빈 저장소에서 schemaVersion 2·오늘 날짜·installId로 Meta를 만들고 알림 기록은 없다', async () => {
    const storage = createMemoryStorage();
    const meta = await okMeta(storage, '2026-10-26', 'install-1');

    const expected = { schemaVersion: 2, lastOpenedDate: '2026-10-26', installId: 'install-1' };
    expect(meta).toEqual(expected);
    const { [META_KEY]: raw } = await storage.getItems([META_KEY]);
    expect(JSON.parse(raw!)).toEqual(expected);
  });

  it('재실행하면 저장된 Meta를 그대로 불러오고 installId를 유지한다', async () => {
    const storage = createMemoryStorage();
    const first = await okMeta(storage, '2026-10-26', 'install-1');
    const second = await okMeta(storage, '2026-10-27', 'install-2');

    expect(second).toEqual(first);
    expect(second.installId).toBe('install-1');
  });

  it.each(['{broken', JSON.stringify({ schemaVersion: 1, lastOpenedDate: '26/10/2026', installId: 'i' })])(
    '저장된 Meta가 손상(%s)이면 덮어쓰지 않고 원본을 돌려준다',
    async (broken) => {
      const storage = createMemoryStorage();
      await storage.setItems({ [META_KEY]: broken });

      expect(await initMeta({ storage, today: '2026-10-26', newId: () => 'install-1' })).toEqual({ ok: false, raw: broken });
      const { [META_KEY]: raw } = await storage.getItems([META_KEY]);
      expect(raw).toBe(broken);
    },
  );
});

describe('saveLastOpenedDate / recordOpened', () => {
  const setup = async () => {
    const storage = createMemoryStorage();
    const meta = await okMeta(storage, '2026-10-25', 'install-1');
    const stored = async () => JSON.parse((await storage.getItems([META_KEY]))[META_KEY]!);
    return { storage, meta, stored };
  };

  it('saveLastOpenedDate는 lastOpenedDate만 바꿔 저장한다', async () => {
    const { storage, meta, stored } = await setup();
    const next = await saveLastOpenedDate(storage, meta, '2026-10-26');
    expect(next).toEqual({ schemaVersion: 2, lastOpenedDate: '2026-10-26', installId: 'install-1' });
    expect(await stored()).toEqual(next);
  });

  it('다음 날 재실행이면 installId·schemaVersion은 그대로, lastOpenedDate만 갱신한다', async () => {
    const { storage, meta, stored } = await setup();
    const loaded = await okMeta(storage, '2026-10-26', 'install-2');
    const result = await recordOpened(storage, loaded, '2026-10-26');
    expect(result.clock).toEqual({ rolledBack: false, lastOpenedDate: '2026-10-26' });
    expect(await stored()).toEqual({ ...meta, lastOpenedDate: '2026-10-26' });
  });

  it('되돌림이면 저장하지 않는다', async () => {
    const { storage, meta } = await setup();
    let writes = 0;
    const spy = { ...storage, setItems: async (e: Record<string, string>) => { writes++; await storage.setItems(e); } };
    const result = await recordOpened(spy, meta, '2026-10-20');
    expect(result.clock.rolledBack).toBe(true);
    expect(result.meta).toBe(meta);
    expect(writes).toBe(0);
  });

  it('같은 날이면 저장하지 않는다', async () => {
    const { storage, meta } = await setup();
    let writes = 0;
    const spy = { ...storage, setItems: async (e: Record<string, string>) => { writes++; await storage.setItems(e); } };
    await recordOpened(spy, meta, '2026-10-25');
    expect(writes).toBe(0);
  });
});

describe('migrateMeta', () => {
  it('v1은 알림 기록 없이 버전만 2로 올린다', () => {
    const v1 = { schemaVersion: 1, lastOpenedDate: '2026-10-26', installId: 'i1' };
    expect(migrateMeta(v1)).toEqual({ ...v1, schemaVersion: 2 });
  });

  it('현재 버전이면 같은 객체를 돌려준다', () => {
    const v2 = { schemaVersion: 2, lastOpenedDate: '2026-10-26', installId: 'i1' };
    expect(migrateMeta(v2)).toBe(v2);
  });
});
