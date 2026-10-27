import { describe, expect, it } from 'vitest';
import { type ContentAction, contentReducer, emptyContent } from '../../domain/content';
import { isCard, isDeck, isMeta, isReviewLog, isSubject, parseValidList } from './validate';

const T = '2026-10-26T00:00:00.000Z';
// 실제 리듀서로 만든 항목(앱이 저장하는 형식 그대로)
const state = (
  [
    { type: 'subject/add', id: 's1', name: '영어', now: T },
    { type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: T },
    { type: 'card/add', id: 'c1', deckId: 'd1', question: 'q', answer: 'a', now: T, today: '2026-10-26' },
    { type: 'card/review', cardId: 'c1', deckId: 'd1', grade: 'remember', date: '2026-10-26', now: T, logId: 'l1' },
  ] as ContentAction[]
).reduce(contentReducer, emptyContent);
const subject = state.subjects[0];
const deck = state.decks[0];
const card = state.cards.d1[0];
const log = state.logs['2026-10'][0];
const meta = { schemaVersion: 1, lastOpenedDate: '2026-10-26', installId: 'i1' };

describe('항목 검사기', () => {
  it('앱이 만든 항목은 통과한다', () => {
    expect(isSubject(subject)).toBe(true);
    expect(isDeck(deck)).toBe(true);
    expect(isCard(card)).toBe(true);
    expect(isReviewLog(log)).toBe(true);
    expect(isMeta(meta)).toBe(true);
  });

  it('필드 누락·타입 오류', () => {
    const { dueDate: _, ...noDue } = card.schedule;
    expect(isCard({ ...card, schedule: noDue })).toBe(false);
    expect(isDeck({ ...deck, subjectId: undefined })).toBe(false);
    expect(isCard({ ...card, question: 3 })).toBe(false);
    expect(isMeta({ ...meta, installId: '' })).toBe(false);
  });

  it('날짜 형식', () => {
    expect(isReviewLog({ ...log, date: '2026/10/26' })).toBe(false);
    expect(isCard({ ...card, schedule: { ...card.schedule, dueDate: '2026-10-2' } })).toBe(false);
    expect(isSubject({ ...subject, createdAt: 'not-a-date' })).toBe(false);
  });

  it('길이 제한', () => {
    expect(isDeck({ ...deck, name: 'a'.repeat(31) })).toBe(false);
    expect(isSubject({ ...subject, name: '  ' })).toBe(false);
    expect(isCard({ ...card, question: 'q'.repeat(501) })).toBe(false);
  });

  it('stage는 0~6 정수', () => {
    expect(isCard({ ...card, schedule: { ...card.schedule, stage: 7 } })).toBe(false);
    expect(isCard({ ...card, schedule: { ...card.schedule, stage: 1.5 } })).toBe(false);
    expect(isReviewLog({ ...log, nextStage: -1 })).toBe(false);
  });
});

describe('parseValidList', () => {
  it('값이 없으면 빈 목록, 정상 목록은 그대로', () => {
    expect(parseValidList(null, isCard)).toEqual({ ok: true, value: [] });
    expect(parseValidList(JSON.stringify([card]), isCard)).toEqual({ ok: true, value: [card] });
  });

  it('JSON 아님·목록 아님·항목 하나라도 틀리면 실패', () => {
    expect(parseValidList('[{broken', isCard)).toEqual({ ok: false });
    expect(parseValidList(JSON.stringify(card), isCard)).toEqual({ ok: false });
    expect(parseValidList(JSON.stringify([card, { ...card, id: '' }]), isCard)).toEqual({ ok: false });
  });
});
