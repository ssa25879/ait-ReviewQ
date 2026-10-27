import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeBackupCode, encodeBackupCode, extractBackupCode } from './backupCode';
import { EXPORT_FORMAT, type ExportDoc, validateExport } from './exportData';

const doc: ExportDoc = {
  format: EXPORT_FORMAT,
  formatVersion: 1,
  exportedAt: '2026-10-27T03:00:00.000Z',
  schemaVersion: 2,
  subjects: [{ id: 's1', name: '수학 "공식"', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }],
  decks: [{ id: 'd1', subjectId: 's1', name: '근의 공식 / 넓이', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }],
  cards: {
    d1: [
      {
        id: 'c1',
        deckId: 'd1',
        question: '근의 공식\n(줄바꿈)',
        answer: 'x = (-b ± √(b²-4ac)) / 2a 🙂',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        schedule: {
          stage: 0,
          dueDate: '2026-10-01',
          lastReviewedDate: null,
          reviewCount: 0,
          lapseCount: 0,
          algorithmId: 'fixed-interval',
          algorithmVersion: 1,
        },
      },
    ],
  },
  logs: {},
};

afterEach(() => vi.unstubAllGlobals());

describe('백업 코드', () => {
  it('압축 코드는 RQB1이고 풀면 같은 문서·형식 검증 통과', async () => {
    const code = await encodeBackupCode(doc);
    expect(code).toMatch(/^RQB1\.[A-Za-z0-9_-]+$/);
    const json = await decodeBackupCode(code);
    expect(JSON.parse(json)).toEqual(doc);
    expect(validateExport(JSON.parse(json))).toBe(true);
  });

  it('CompressionStream이 없으면 압축 없는 RQB0 코드를 만들고 풀 수 있다', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const code = await encodeBackupCode(doc);
    expect(code).toMatch(/^RQB0\./);
    vi.unstubAllGlobals();
    expect(JSON.parse(await decodeBackupCode(code))).toEqual(doc);
  });

  it('공유 메시지 안이나 줄바꿈이 낀 코드도 찾는다', async () => {
    const code = await encodeBackupCode(doc);
    expect(extractBackupCode(`복습큐 백업 코드예요.\n\n${code}\n`)).toBe(code);
    const broken = `${code.slice(0, 20)}\n${code.slice(20, 40)} ${code.slice(40)}`;
    expect(extractBackupCode(broken)).toBe(code);
    expect(extractBackupCode('{"format":"reviewq-backup"}')).toBeNull();
  });

  it('잘린 코드는 예외', async () => {
    const code = await encodeBackupCode(doc);
    await expect(decodeBackupCode(code.slice(0, code.length - 10))).rejects.toThrow();
  });
});
