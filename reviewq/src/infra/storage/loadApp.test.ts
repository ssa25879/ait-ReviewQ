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
    expect(result).toMatchObject({ kind: 'ok', meta, content: { subjects: [], decks: [] } });
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

  it('저장소 읽기가 실패하면 readFailed', async () => {
    const error = new Error('io');
    const failing: StorageAdapter = { ...createMemoryStorage(), getItems: () => Promise.reject(error) };
    expect(await loadApp({ storage: failing, today, newId })).toEqual({ kind: 'readFailed', error });
  });
});
