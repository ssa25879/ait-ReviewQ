import { describe, expect, it } from 'vitest';
import { createActions } from '../app/actions';
import { type ContentAction, type ContentState, contentReducer, emptyContent } from './content';
import type { Grade } from './scheduler/types';
import { type SessionState, currentItem, flip, isFinished, judge, progress, startSession, summarize } from './session';

const T = '2026-10-26T00:00:00.000Z';
const DATE = '2026-10-26';
const queue = ['A', 'B', 'C'].map((id) => ({ cardId: id, deckId: 'd1' }));

// 과목 s1 · 덱 d1에 카드를 만든다
function seed(cardIds: string[]): ContentState {
  const actions: ContentAction[] = [
    { type: 'subject/add', id: 's1', name: '영어', now: T },
    { type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: T },
    ...cardIds.map((id): ContentAction => ({ type: 'card/add', id, deckId: 'd1', question: 'q', answer: 'a', now: T, today: DATE })),
  ];
  return actions.reduce(contentReducer, emptyContent);
}

function answer(session: SessionState, grade: Grade) {
  return judge(flip(session), grade);
}

describe('세션 진행', () => {
  it('뒤집기 전 판정은 무시하고 같은 카드의 질문 상태를 유지한다', () => {
    const s = startSession(queue, DATE);
    const r = judge(s, 'remember');
    expect(r.session).toBe(s);
    expect(r.apply).toBeUndefined();
    expect(currentItem(r.session)?.cardId).toBe('A');
    expect(r.session.flipped).toBe(false);
  });

  it('첫 판정은 apply를 돌려주고 다음 카드 질문으로 넘어간다', () => {
    const r = answer(startSession(queue, DATE), 'remember');
    expect(r.apply).toEqual({ cardId: 'A', deckId: 'd1', grade: 'remember', date: DATE });
    expect(currentItem(r.session)?.cardId).toBe('B');
    expect(r.session.flipped).toBe(false);
  });

  it('기억 못 한 카드는 끝에 1회 재출제하고 재출제 판정은 apply가 없다', () => {
    let s = startSession(queue, DATE);
    const applies = [];
    for (const g of ['remember', 'forget', 'remember'] as Grade[]) {
      const r = answer(s, g);
      applies.push(r.apply);
      s = r.session;
    }
    expect(applies.map((a) => a?.cardId)).toEqual(['A', 'B', 'C']);
    expect(currentItem(s)?.cardId).toBe('B');

    const retry = answer(s, 'remember');
    expect(retry.apply).toBeUndefined();
    expect(isFinished(retry.session)).toBe(true);
  });

  it('재출제에서 다시 기억 못 함이어도 더 나오지 않는다', () => {
    let s = startSession(queue.slice(0, 1), DATE);
    s = answer(s, 'forget').session;
    const r = answer(s, 'forget');
    expect(r.apply).toBeUndefined();
    expect(r.session.order).toHaveLength(2);
    expect(isFinished(r.session)).toBe(true);
  });

  it('카드 3장 세션의 두 번째 카드에서 진행은 2/3이다', () => {
    const s = answer(startSession(queue, DATE), 'remember').session;
    expect(progress(s)).toEqual({ phase: 'first', current: 2, total: 3, pendingRetry: 0 });
  });

  it('첫 회차는 기억 못 함이 생겨도 전체 수가 시작 카드 수로 고정된다', () => {
    const s = answer(startSession(queue, DATE), 'forget').session;
    expect(s.initialCount).toBe(3);
    expect(progress(s)).toEqual({ phase: 'first', current: 2, total: 3, pendingRetry: 1 });
  });

  it('첫 회차를 마치면 다시 보기 구간의 순번과 재출제 카드 수를 따로 센다', () => {
    let s = startSession(queue, DATE);
    for (const g of ['forget', 'remember', 'forget'] as Grade[]) s = answer(s, g).session;
    expect(progress(s)).toEqual({ phase: 'retry', current: 1, total: 2, pendingRetry: 2 });
    // 다시 보기에서 또 기억 못 함이어도 구간 수는 늘지 않는다
    s = answer(s, 'forget').session;
    expect(progress(s)).toEqual({ phase: 'retry', current: 2, total: 2, pendingRetry: 2 });
  });

  it('끝난 세션은 마지막 구간 값으로 고정된다', () => {
    let s = startSession(queue, DATE);
    for (const g of ['remember', 'remember', 'remember'] as Grade[]) s = answer(s, g).session;
    expect(progress(s)).toEqual({ phase: 'first', current: 3, total: 3, pendingRetry: 0 });

    let r = startSession(queue, DATE);
    for (const g of ['forget', 'remember', 'remember', 'remember'] as Grade[]) r = answer(r, g).session;
    expect(isFinished(r)).toBe(true);
    expect(progress(r)).toEqual({ phase: 'retry', current: 1, total: 1, pendingRetry: 1 });
  });

  it('끝난 세션의 판정·뒤집기는 무시한다', () => {
    const done = answer(startSession(queue.slice(0, 1), DATE), 'remember').session;
    expect(flip(done)).toBe(done);
    expect(judge(done, 'remember').session).toBe(done);
  });

  it('자정이 지나 판정해도 세션 날짜로 반영된다 (S-09)', () => {
    const a = createActions({ newId: () => 'log1', now: () => new Date(2026, 9, 27, 0, 1) });
    let state = seed(['A']);

    const { apply } = answer(startSession(queue.slice(0, 1), DATE), 'remember');
    state = contentReducer(state, a.reviewCard(apply!.cardId, apply!.deckId, apply!.grade, apply!.date));

    expect(state.cards.d1[0].schedule).toMatchObject({ lastReviewedDate: DATE, dueDate: '2026-10-27' });
    expect(state.logs['2026-10'][0].date).toBe(DATE);
  });

  it('요약은 반영된 판정 수·기억함 수·다시 본 카드 수·다음 날 예정 수를 알려 준다', () => {
    let state = seed(queue.map((q) => q.cardId));

    let s = startSession(queue, DATE);
    for (const g of ['remember', 'forget', 'remember', 'remember'] as Grade[]) {
      const r = answer(s, g);
      if (r.apply) {
        state = contentReducer(state, {
          type: 'card/review', ...r.apply, now: T, logId: `l-${r.apply.cardId}`,
        });
      }
      s = r.session;
    }
    expect(isFinished(s)).toBe(true);
    // A·C는 stage 1(10-27), B는 기억 못 함(10-27)
    expect(summarize(s, state)).toEqual({ completed: 3, remembered: 2, retried: 1, dueTomorrow: 3 });
  });

  it('모두 기억함이면 다시 본 카드는 0이다', () => {
    let s = startSession(queue, DATE);
    for (const g of ['remember', 'remember', 'remember'] as Grade[]) s = answer(s, g).session;
    expect(summarize(s, seed([])).retried).toBe(0);
  });
});
