import { describe, expect, it } from 'vitest';
import { type ContentAction, contentReducer, emptyContent } from '../../domain/content';
import type { StorageAdapter } from './StorageAdapter';
import type { Backup } from './backup';
import { DECKS_KEY, META_KEY, SUBJECTS_KEY, cardsKey, logsKey, quarantineKey } from './keys';
import { loadApp } from './loadApp';
import { createMemoryStorage } from './memoryStorage';
import { canRestoreFromBackup, dropCorrupt, restoreFromBackup } from './recovery';

const T = '2026-10-26T00:00:00.000Z';
const today = '2026-10-26';
const newId = () => 'new-install';
const content = (
  [
    { type: 'subject/add', id: 's1', name: '영어', now: T },
    { type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: T },
    { type: 'deck/add', id: 'd2', subjectId: 's1', name: '문법', now: T },
    ...['c1', 'c2', 'c3'].map((id) => ({ type: 'card/add', id, deckId: 'd1', question: id, answer: 'a', now: T, today })),
    { type: 'card/add', id: 'c4', deckId: 'd2', question: 'c4', answer: 'a', now: T, today },
    { type: 'card/review', cardId: 'c1', deckId: 'd1', grade: 'remember', date: today, now: T, logId: 'l1' },
  ] as ContentAction[]
).reduce(contentReducer, emptyContent);
const meta = { schemaVersion: 1, lastOpenedDate: today, installId: 'install-1' };
const backup: Backup = {
  date: '2026-10-25',
  savedAt: T,
  subjects: content.subjects,
  decks: [content.decks[0]],
  cards: { d1: content.cards.d1 },
};

// 앱 형식으로 저장해 두고, 쓰기 순서를 기록하는 저장소
async function seeded() {
  const storage = createMemoryStorage();
  await storage.setItems({
    [META_KEY]: JSON.stringify(meta),
    [SUBJECTS_KEY]: JSON.stringify(content.subjects),
    [DECKS_KEY]: JSON.stringify(content.decks),
    [cardsKey('d1')]: JSON.stringify(content.cards.d1),
    [cardsKey('d2')]: JSON.stringify(content.cards.d2),
    [logsKey(today)]: JSON.stringify(content.logs['2026-10']),
  });
  const ops: string[] = [];
  const spy: StorageAdapter = {
    ...storage,
    setItems: (e) => (ops.push(...Object.keys(e).map((k) => `set ${k}`)), storage.setItems(e)),
    removeItem: (k) => (ops.push(`remove ${k}`), storage.removeItem(k)),
  };
  return { storage, spy, ops };
}
const get = async (storage: StorageAdapter, key: string) => (await storage.getItems([key]))[key];

describe('격리', () => {
  it('격리 키에 원본을 먼저 저장한 뒤 원래 키를 바꾼다 (D-04)', async () => {
    const { storage, spy, ops } = await seeded();
    await storage.setItems({ [cardsKey('d2')]: '[{broken' });

    await dropCorrupt({ storage: spy, corrupt: { [cardsKey('d2')]: '[{broken' }, today, newId });
    expect(await get(storage, quarantineKey(cardsKey('d2')))).toBe('[{broken');
    expect(ops).toEqual([`set ${quarantineKey(cardsKey('d2'))}`, `remove ${cardsKey('d2')}`]);
  });

  it('격리 저장이 실패하면 원래 키를 바꾸지 않는다', async () => {
    const { storage } = await seeded();
    await storage.setItems({ [cardsKey('d2')]: '[{broken' });
    const failing: StorageAdapter = { ...storage, setItems: () => Promise.reject(new Error('full')), removeItem: storage.removeItem };

    await expect(dropCorrupt({ storage: failing, corrupt: { [cardsKey('d2')]: '[{broken' }, today, newId })).rejects.toThrow('full');
    await expect(
      restoreFromBackup({ storage: failing, corrupt: { [cardsKey('d2')]: '[{broken' }, today, newId }, backup),
    ).rejects.toThrow('full');
    expect(await get(storage, cardsKey('d2'))).toBe('[{broken');
  });
});

describe('백업으로 복구', () => {
  it('과목·덱·카드를 백업 내용과 다음 복습일로 되돌리고 손상 로그는 빈 목록, 정상 로그는 유지한다', async () => {
    const { storage, spy, ops } = await seeded();
    const corrupt = { [cardsKey('d1')]: 'x', [logsKey('2026-09')]: 'y' };
    await storage.setItems(corrupt);

    await restoreFromBackup({ storage: spy, corrupt, today, newId }, backup);
    expect(ops.slice(0, 2)).toEqual([`set ${quarantineKey(cardsKey('d1'))}`, `set ${quarantineKey(logsKey('2026-09'))}`]);
    expect(ops).toContain(`remove ${cardsKey('d2')}`); // 백업에 없는 덱의 카드 키 정리

    const loaded = await loadApp({ storage, today, newId });
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.content.subjects).toEqual(backup.subjects);
    expect(loaded.content.decks).toEqual(backup.decks);
    expect(loaded.content.cards).toEqual({ d1: content.cards.d1 });
    expect(loaded.content.cards.d1[0].schedule.dueDate).toBe(content.cards.d1[0].schedule.dueDate);
    expect(loaded.content.logs).toEqual({ '2026-10': content.logs['2026-10'], '2026-09': [] });
    expect(loaded.meta.installId).toBe('install-1');
  });

  it('덱 목록이 손상이면 기존 카드 키를 정리하지 않고 백업 덱을 저장한다', async () => {
    const { storage, spy, ops } = await seeded();
    await storage.setItems({ [DECKS_KEY]: 'x' });

    await restoreFromBackup({ storage: spy, corrupt: { [DECKS_KEY]: 'x' }, today, newId }, backup);
    expect(ops.filter((op) => op.startsWith('remove'))).toEqual([]);
    expect(JSON.parse((await get(storage, DECKS_KEY))!)).toEqual(backup.decks);
  });
});

describe('손상 항목 빼고 열기', () => {
  it('손상된 덱의 카드만 비고 다른 덱은 그대로다', async () => {
    const { storage } = await seeded();
    await storage.setItems({ [cardsKey('d1')]: 'x' });

    await dropCorrupt({ storage, corrupt: { [cardsKey('d1')]: 'x' }, today, newId });
    const loaded = await loadApp({ storage, today, newId });
    expect(loaded.kind === 'ok' && loaded.content.cards).toEqual({ d1: [], d2: content.cards.d2 });
  });

  it('Meta가 손상이면 새 Meta를 만든다', async () => {
    const { storage } = await seeded();
    await storage.setItems({ [META_KEY]: '{broken' });

    await dropCorrupt({ storage, corrupt: { [META_KEY]: '{broken' }, today, newId });
    expect(await get(storage, quarantineKey(META_KEY))).toBe('{broken');
    const loaded = await loadApp({ storage, today, newId });
    expect(loaded.kind === 'ok' && loaded.meta).toEqual({ schemaVersion: 2, lastOpenedDate: today, installId: 'new-install' });
  });
});

describe('백업 복구 제공 조건', () => {
  it('과목·덱·카드 키 중 하나가 손상되고 백업이 있을 때만 제공한다', () => {
    expect(canRestoreFromBackup([cardsKey('d1')], backup)).toBe(true);
    expect(canRestoreFromBackup([SUBJECTS_KEY, logsKey(today)], backup)).toBe(true);
    expect(canRestoreFromBackup([DECKS_KEY], backup)).toBe(true);
    expect(canRestoreFromBackup([cardsKey('d1')], null)).toBe(false);
  });

  it('판정 기록·Meta만 손상이면 제공하지 않는다(멀쩡한 콘텐츠를 되돌리지 않도록)', () => {
    expect(canRestoreFromBackup([logsKey(today)], backup)).toBe(false);
    expect(canRestoreFromBackup([META_KEY], backup)).toBe(false);
    expect(canRestoreFromBackup([META_KEY, logsKey('2026-09')], backup)).toBe(false);
  });
});
