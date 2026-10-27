import { describe, expect, it } from 'vitest';
import { type ContentAction, type ContentState, contentReducer, emptyContent } from '../../domain/content';
import type { ReviewLog } from '../../domain/model';
import {
  EXPORT_FORMAT,
  ExportCorruptError,
  buildExport,
  exportFileName,
  exportLogMonths,
  toBase64Utf8,
  validateExport,
} from './exportData';
import { META_KEY, logsKey } from './keys';
import { createMemoryStorage } from './memoryStorage';

const today = '2026-10-27';
const at = (date: string) => `${date}T03:00:00.000Z`;
const build = (actions: ContentAction[]) => actions.reduce(contentReducer, emptyContent);

const content = build([
  { type: 'subject/add', id: 's1', name: '영어', now: at('2026-07-10') },
  { type: 'subject/add', id: 's2', name: '수학', now: at('2026-07-11') },
  { type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: at('2026-07-10') },
  { type: 'deck/add', id: 'd2', subjectId: 's2', name: '공식', now: at('2026-07-11') },
  { type: 'card/add', id: 'c1', deckId: 'd1', question: '사과', answer: 'apple', now: at('2026-07-10'), today: '2026-07-10' },
  { type: 'card/add', id: 'c2', deckId: 'd2', question: '근의 공식', answer: '...', now: at('2026-07-11'), today: '2026-07-11' },
]);

const log = (id: string, date: string): ReviewLog => ({
  id,
  cardId: 'c1',
  date,
  grade: 'remember',
  prevStage: 0,
  nextStage: 1,
  reviewedAt: at(date),
});

describe('exportLogMonths', () => {
  it('가장 이른 생성 달의 한 달 앞부터 이번 달까지', () => {
    expect(exportLogMonths(content, today)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('연도 경계를 넘는다', () => {
    const c = build([{ type: 'subject/add', id: 's1', name: '영어', now: at('2025-12-05') }]);
    expect(exportLogMonths(c, '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('데이터가 없으면 이번 달만', () => {
    expect(exportLogMonths(emptyContent, today)).toEqual(['2026-10']);
  });

  it('로드된 판정 기록 달이 더 이르면 그 달부터', () => {
    const c: ContentState = { ...emptyContent, logs: { '2026-09': [] } };
    expect(exportLogMonths(c, today)).toEqual(['2026-09', '2026-10']);
  });
});

describe('buildExport', () => {
  it('과목·덱·카드와 저장된 모든 달의 판정 기록을 담고, 알림 기록·기기 식별자는 넣지 않는다', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({
      [logsKey('2026-07')]: JSON.stringify([log('l1', '2026-07-12')]),
      [logsKey('2026-10')]: JSON.stringify([log('l2', '2026-10-27')]),
      [META_KEY]: JSON.stringify({ schemaVersion: 2, lastOpenedDate: today, installId: 'secret', notification: { agreed: true, lastAskedAt: at(today) } }),
    });
    const doc = await buildExport({ storage, content, schemaVersion: 2, today, now: new Date(at(today)) });

    expect(doc).toEqual({
      format: EXPORT_FORMAT,
      formatVersion: 1,
      exportedAt: at(today),
      schemaVersion: 2,
      subjects: content.subjects,
      decks: content.decks,
      cards: content.cards,
      logs: { '2026-07': [log('l1', '2026-07-12')], '2026-10': [log('l2', '2026-10-27')] },
    });
    const text = JSON.stringify(doc);
    expect(text).not.toContain('secret');
    expect(text).not.toContain('notification');
    expect(validateExport(JSON.parse(text))).toBe(true);
  });

  it('메모리에 올라온 달은 저장소 대신 메모리의 판정 기록을 쓴다(저장 실패로 저장소가 뒤처진 경우)', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({
      [logsKey('2026-07')]: JSON.stringify([log('l1', '2026-07-12')]),
      [logsKey('2026-10')]: JSON.stringify([log('l2', '2026-10-26')]), // 판정 직후 저장 실패로 l3가 빠진 값
      [logsKey('2026-09')]: '{깨짐', // 메모리에 있는 달은 저장소 값을 읽지 않는다
    });
    const memory: ContentState = {
      ...content,
      logs: { '2026-09': [], '2026-10': [log('l2', '2026-10-26'), log('l3', '2026-10-27')] },
    };
    const doc = await buildExport({ storage, content: memory, schemaVersion: 2, today });
    expect(doc.logs).toEqual({
      '2026-07': [log('l1', '2026-07-12')],
      '2026-10': [log('l2', '2026-10-26'), log('l3', '2026-10-27')],
    });
  });

  it('빈 데이터도 유효한 문서가 된다', async () => {
    const doc = await buildExport({ storage: createMemoryStorage(), content: emptyContent, schemaVersion: 2, today });
    expect(doc).toMatchObject({ subjects: [], decks: [], cards: {}, logs: {} });
    expect(validateExport(JSON.parse(JSON.stringify(doc)))).toBe(true);
  });

  it('형식이 맞지 않는 달이 있으면 예외를 던진다', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({ [logsKey('2026-08')]: '{깨짐' });
    await expect(buildExport({ storage, content, schemaVersion: 2, today })).rejects.toBeInstanceOf(ExportCorruptError);
  });
});

describe('validateExport', () => {
  const valid = {
    format: EXPORT_FORMAT,
    formatVersion: 1,
    exportedAt: at(today),
    schemaVersion: 2,
    subjects: content.subjects,
    decks: content.decks,
    cards: content.cards,
    logs: {},
  };

  it('형식이 틀린 항목을 거른다', () => {
    expect(validateExport(valid)).toBe(true);
    expect(validateExport({ ...valid, format: 'other' })).toBe(false);
    expect(validateExport({ ...valid, subjects: [{ id: 's1' }] })).toBe(false);
    expect(validateExport({ ...valid, cards: { d1: [{}] } })).toBe(false);
    expect(validateExport({ ...valid, logs: { '2026-10': [{ id: 'x' }] } })).toBe(false);
    expect(validateExport({ ...valid, cards: [] })).toBe(false);
    expect(validateExport(null)).toBe(false);
  });
});

describe('파일 저장 입력', () => {
  it('파일 이름에 날짜가 들어간다', () => {
    expect(exportFileName(today)).toBe('reviewq-backup-2026-10-27.json');
  });

  it('한글 JSON을 base64로 바꿨다가 되돌리면 같다', () => {
    const text = JSON.stringify({ q: '근의 공식', a: 'x = (-b ± √(b²-4ac)) / 2a' });
    const bytes = Uint8Array.from(atob(toBase64Utf8(text)), (ch) => ch.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe(text);
  });
});
