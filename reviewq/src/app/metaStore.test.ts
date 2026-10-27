import { describe, expect, it } from 'vitest';
import type { Meta } from '../domain/model';
import type { StorageAdapter } from '../infra/storage/StorageAdapter';
import { META_KEY } from '../infra/storage/keys';
import { createMemoryStorage } from '../infra/storage/memoryStorage';
import { createMetaStore } from './metaStore';

const meta: Meta = { schemaVersion: 2, lastOpenedDate: '2026-10-25', installId: 'i1' };
const consent = { agreed: true, agreedAt: '2026-10-26T00:00:00.000Z', lastAskedAt: '2026-10-26T00:00:00.000Z' };
const stored = async (storage: StorageAdapter) => JSON.parse((await storage.getItems([META_KEY]))[META_KEY]!);

describe('metaStore', () => {
  it('날짜 갱신과 동의 기록을 동시에 요청해도 두 값이 모두 저장된다', async () => {
    const storage = createMemoryStorage();
    const store = createMetaStore(storage);
    store.reset(meta);

    await Promise.all([
      store.update((m) => ({ ...m, lastOpenedDate: '2026-10-26' })),
      store.update((m) => ({ ...m, notification: consent })),
    ]);
    expect(await stored(storage)).toEqual({ ...meta, lastOpenedDate: '2026-10-26', notification: consent });
    expect(store.get()).toEqual({ ...meta, lastOpenedDate: '2026-10-26', notification: consent });
  });

  it('저장은 요청 순서대로 하나씩 실행된다', async () => {
    const base = createMemoryStorage();
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let first = true;
    const storage: StorageAdapter = {
      ...base,
      setItems: async (e) => {
        const date = JSON.parse(e[META_KEY]).lastOpenedDate;
        log.push(`start ${date}`);
        if (first) {
          first = false;
          await gate;
        }
        await base.setItems(e);
        log.push(`end ${date}`);
      },
    };
    const store = createMetaStore(storage);
    store.reset(meta);

    const a = store.update((m) => ({ ...m, lastOpenedDate: '2026-10-26' }));
    const b = store.update((m) => ({ ...m, lastOpenedDate: '2026-10-27' }));
    await Promise.resolve();
    expect(log).toEqual(['start 2026-10-26']);
    release();
    await Promise.all([a, b]);
    expect(log).toEqual(['start 2026-10-26', 'end 2026-10-26', 'start 2026-10-27', 'end 2026-10-27']);
    expect((await stored(base)).lastOpenedDate).toBe('2026-10-27');
  });

  it('저장이 실패해도 메모리 값은 유지되고 다음 저장 때 함께 저장된다', async () => {
    const base = createMemoryStorage();
    let fail = true;
    const storage: StorageAdapter = {
      ...base,
      setItems: (e) => (fail ? Promise.reject(new Error('full')) : base.setItems(e)),
    };
    const store = createMetaStore(storage);
    store.reset(meta);

    await expect(store.update((m) => ({ ...m, notification: consent }))).rejects.toThrow('full');
    expect(store.get()?.notification).toEqual(consent);
    fail = false;
    await store.update((m) => ({ ...m, lastOpenedDate: '2026-10-26' }));
    expect(await stored(base)).toEqual({ ...meta, lastOpenedDate: '2026-10-26', notification: consent });
  });

  it('바뀌지 않으면 저장하지 않고, 로드 전에는 거부한다', async () => {
    const base = createMemoryStorage();
    let writes = 0;
    const storage: StorageAdapter = { ...base, setItems: (e) => (writes++, base.setItems(e)) };
    const store = createMetaStore(storage);
    await expect(store.update((m) => m)).rejects.toThrow();
    store.reset(meta);
    await store.update((m) => m);
    expect(writes).toBe(0);
  });

  it('구독자는 변경을 받는다', async () => {
    const store = createMetaStore(createMemoryStorage());
    const seen: Meta[] = [];
    const unsubscribe = store.subscribe((m) => seen.push(m));
    store.reset(meta);
    await store.update((m) => ({ ...m, notification: consent }));
    unsubscribe();
    store.reset(meta);
    expect(seen.map((m) => m.notification)).toEqual([undefined, consent]);
  });
});
