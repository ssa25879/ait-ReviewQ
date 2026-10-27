import { describe, expect, it } from 'vitest';
import { type ContentAction, contentReducer, emptyContent } from '../../domain/content';
import type { StorageAdapter } from './StorageAdapter';
import { readBackup, saveBackup } from './backup';
import { BACKUP_KEY, DECKS_KEY, META_KEY, SUBJECTS_KEY, cardsKey } from './keys';
import { loadApp } from './loadApp';
import { createMemoryStorage } from './memoryStorage';

const T = '2026-10-26T00:00:00.000Z';
const today = '2026-10-26';
const content = (
  [
    { type: 'subject/add', id: 's1', name: '영어', now: T },
    { type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: T },
    { type: 'card/add', id: 'c1', deckId: 'd1', question: 'q', answer: 'a', now: T, today },
  ] as ContentAction[]
).reduce(contentReducer, emptyContent);
// loadApp은 백업 저장을 기다리지 않으므로, 확인 전에 남은 비동기 작업을 흘려보낸다
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const meta = (lastOpenedDate: string) => JSON.stringify({ schemaVersion: 1, lastOpenedDate, installId: 'i1' });

// 콘텐츠를 앱 형식으로 저장해 둔 저장소
async function seeded(lastOpenedDate: string) {
  const storage = createMemoryStorage();
  await storage.setItems({
    [META_KEY]: meta(lastOpenedDate),
    [SUBJECTS_KEY]: JSON.stringify(content.subjects),
    [DECKS_KEY]: JSON.stringify(content.decks),
    [cardsKey('d1')]: JSON.stringify(content.cards.d1),
  });
  const writes: string[] = [];
  const spy: StorageAdapter = { ...storage, setItems: (e) => (writes.push(...Object.keys(e)), storage.setItems(e)) };
  return { storage, spy, writes };
}

describe('백업', () => {
  it('저장한 백업을 그대로 읽는다', async () => {
    const storage = createMemoryStorage();
    await saveBackup(storage, content, today, new Date(T));
    expect(await readBackup(storage)).toEqual({
      date: today,
      savedAt: T,
      subjects: content.subjects,
      decks: content.decks,
      cards: content.cards,
    });
  });

  it('없거나 손상된 백업은 사용할 수 없다(null)', async () => {
    const storage = createMemoryStorage();
    expect(await readBackup(storage)).toBeNull();
    await storage.setItems({ [BACKUP_KEY]: '{broken' });
    expect(await readBackup(storage)).toBeNull();
    await storage.setItems({ [BACKUP_KEY]: JSON.stringify({ date: today, savedAt: T, subjects: [{ id: 's' }], decks: [], cards: {} }) });
    expect(await readBackup(storage)).toBeNull();
  });
});

describe('loadApp의 백업 시점', () => {
  it('하루 첫 실행(마지막으로 연 날이 어제)이면 오늘 날짜로 백업한다', async () => {
    const { storage, spy } = await seeded('2026-10-25');
    await loadApp({ storage: spy, today, newId: () => 'x' });
    await settle();
    const backup = await readBackup(storage);
    expect(backup).toMatchObject({ date: today, subjects: content.subjects, decks: content.decks, cards: content.cards });
  });

  it('같은 날 다시 실행하면 백업하지 않는다', async () => {
    const { spy, writes } = await seeded(today);
    await loadApp({ storage: spy, today, newId: () => 'x' });
    await settle();
    expect(writes).not.toContain(BACKUP_KEY);
  });

  it('손상 상태에서는 백업을 갱신하지 않는다', async () => {
    const { storage, spy, writes } = await seeded('2026-10-25');
    await storage.setItems({ [cardsKey('d1')]: 'x' });
    expect((await loadApp({ storage: spy, today, newId: () => 'x' })).kind).toBe('corrupt');
    await settle();
    expect(writes).not.toContain(BACKUP_KEY);
  });

  it('백업 저장을 기다리지 않고 정상 결과를 먼저 돌려준다', async () => {
    const { storage } = await seeded('2026-10-25');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: StorageAdapter = {
      ...storage,
      setItems: async (e) => {
        if (BACKUP_KEY in e) await gate; // 백업 저장만 멈춰 둔다
        return storage.setItems(e);
      },
    };
    expect((await loadApp({ storage: slow, today, newId: () => 'x' })).kind).toBe('ok');
    expect(await readBackup(storage)).toBeNull();
    release();
    await settle();
    expect((await readBackup(storage))?.date).toBe(today);
  });

  it('백업 저장이 실패해도 정상 로드된다', async () => {
    const { storage } = await seeded('2026-10-25');
    const failing: StorageAdapter = { ...storage, setItems: () => Promise.reject(new Error('full')) };
    expect((await loadApp({ storage: failing, today, newId: () => 'x' })).kind).toBe('ok');
  });
});
