import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from './StorageAdapter';
import { META_KEY, cardsKey } from './keys';
import { loadApp } from './loadApp';
import { createMemoryStorage } from './memoryStorage';

const today = '2026-10-26';
const newId = () => 'install-1';
const meta = { schemaVersion: 1, lastOpenedDate: today, installId: 'install-1' };

// 쓰기 호출 수를 센다
function counting(storage: StorageAdapter) {
  const writes: string[] = [];
  const spy: StorageAdapter = {
    ...storage,
    setItems: (entries) => (writes.push(...Object.keys(entries)), storage.setItems(entries)),
    removeItem: (key) => (writes.push(key), storage.removeItem(key)),
  };
  return { spy, writes };
}

describe('loadApp', () => {
  it('첫 실행은 Meta를 만들고 빈 콘텐츠로 정상 로드한다', async () => {
    const result = await loadApp({ storage: createMemoryStorage(), today, newId });
    expect(result).toMatchObject({ kind: 'ok', meta: { ...meta, schemaVersion: 2 }, content: { subjects: [], decks: [] } });
  });

  it('Meta가 손상되면 콘텐츠가 정상이어도 손상이고 저장소에 쓰지 않는다', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({ [META_KEY]: '{broken' });
    const { spy, writes } = counting(storage);

    expect(await loadApp({ storage: spy, today, newId })).toEqual({
      kind: 'corrupt',
      corrupt: { [META_KEY]: '{broken' },
      meta: null,
    });
    expect(writes).toEqual([]);
  });

  it('콘텐츠가 손상되면 정상 Meta와 함께 손상 키를 돌려주고 저장소에 쓰지 않는다', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({
      [META_KEY]: JSON.stringify(meta),
      'bq:decks': JSON.stringify([{ id: 'd1', subjectId: 's1', name: '단어', createdAt: today, updatedAt: today }]),
      [cardsKey('d1')]: 'x',
    });
    const { spy, writes } = counting(storage);

    expect(await loadApp({ storage: spy, today, newId })).toEqual({
      kind: 'corrupt',
      corrupt: { [cardsKey('d1')]: 'x' },
      meta,
    });
    expect(writes).toEqual([]);
  });

  it('v1 Meta는 v2로 올려 Meta만 저장하고 콘텐츠는 그대로다 (D-05)', async () => {
    const storage = createMemoryStorage();
    const subjects = [{ id: 's1', name: '영어', createdAt: today, updatedAt: today }];
    await storage.setItems({ [META_KEY]: JSON.stringify(meta), 'bq:subjects': JSON.stringify(subjects) });
    const { spy, writes } = counting(storage);

    const result = await loadApp({ storage: spy, today, newId });
    expect(result).toMatchObject({ kind: 'ok', meta: { schemaVersion: 2, installId: 'install-1' }, content: { subjects } });
    expect(result.kind === 'ok' && result.meta.notification).toBeUndefined();
    expect(writes).toEqual([META_KEY]);
    expect(JSON.parse((await storage.getItems([META_KEY]))[META_KEY]!)).toEqual({ ...meta, schemaVersion: 2 });
  });

  it('v2 Meta는 다시 저장하지 않는다', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({ [META_KEY]: JSON.stringify({ ...meta, schemaVersion: 2 }) });
    const { spy, writes } = counting(storage);
    expect((await loadApp({ storage: spy, today, newId })).kind).toBe('ok');
    expect(writes).toEqual([]);
  });

  it('알림 기록 형식이 틀린 Meta는 손상이다', async () => {
    const storage = createMemoryStorage();
    const raw = JSON.stringify({ ...meta, schemaVersion: 2, notification: { agreed: 'yes', lastAskedAt: today } });
    await storage.setItems({ [META_KEY]: raw });
    expect(await loadApp({ storage, today, newId })).toEqual({ kind: 'corrupt', corrupt: { [META_KEY]: raw }, meta: null });
  });

  it('저장소 읽기가 실패하면 readFailed', async () => {
    const error = new Error('io');
    const failing: StorageAdapter = { ...createMemoryStorage(), getItems: () => Promise.reject(error) };
    expect(await loadApp({ storage: failing, today, newId })).toEqual({ kind: 'readFailed', error });
  });
});
