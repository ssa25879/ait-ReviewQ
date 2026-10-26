import { describe, expect, it } from 'vitest';
import { type ContentAction, type ContentState, contentReducer, emptyContent } from './content';

const T0 = '2026-10-26T00:00:00.000Z';
const T1 = '2026-10-27T00:00:00.000Z';

function apply(state: ContentState, ...actions: ContentAction[]): ContentState {
  return actions.reduce(contentReducer, state);
}

function card(id: string, deckId: string, question = `q-${id}`): ContentAction {
  return { type: 'card/add', id, deckId, question, answer: `a-${id}`, now: T0, today: '2026-10-26' };
}

// 과목 s1(덱 d1: 카드 c1·c2, 덱 d2: 카드 c3), 과목 s2(덱 d3: 카드 c4)
function seed(): ContentState {
  return apply(
    emptyContent,
    { type: 'subject/add', id: 's1', name: '영어', now: T0 },
    { type: 'subject/add', id: 's2', name: '수학', now: T0 },
    { type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: T0 },
    { type: 'deck/add', id: 'd2', subjectId: 's1', name: '문법', now: T0 },
    { type: 'deck/add', id: 'd3', subjectId: 's2', name: '공식', now: T0 },
    card('c1', 'd1'),
    card('c2', 'd1'),
    card('c3', 'd2'),
    card('c4', 'd3'),
  );
}

describe('입력 제한', () => {
  it('공백만 있는 과목명은 만들지 않는다', () => {
    expect(contentReducer(emptyContent, { type: 'subject/add', id: 's1', name: '   ', now: T0 })).toBe(emptyContent);
  });

  it('31자 과목명은 만들지 않는다', () => {
    const state = contentReducer(emptyContent, { type: 'subject/add', id: 's1', name: 'a'.repeat(31), now: T0 });
    expect(state.subjects).toHaveLength(0);
  });

  it('앞뒤 공백을 제거한 30자 덱명으로 만든다', () => {
    const name = 'b'.repeat(30);
    const state = contentReducer(seed(), { type: 'deck/add', id: 'd9', subjectId: 's1', name: ` ${name} `, now: T0 });
    expect(state.decks.find((d) => d.id === 'd9')?.name).toBe(name);
  });

  it('정답이 비면 카드를 저장하지 않는다', () => {
    const before = seed();
    const after = contentReducer(before, {
      type: 'card/add', id: 'c9', deckId: 'd1', question: '질문', answer: '  ', now: T0, today: '2026-10-26',
    });
    expect(after).toBe(before);
  });

  it('줄바꿈이 있는 질문은 줄바꿈을 유지한다', () => {
    const state = contentReducer(seed(), card('c9', 'd1', '첫 줄\n둘째 줄'));
    expect(state.cards.d1.at(-1)?.question).toBe('첫 줄\n둘째 줄');
  });
});

describe('과목 관리', () => {
  it('과목을 만들면 생성·수정 시각이 같다', () => {
    const state = contentReducer(emptyContent, { type: 'subject/add', id: 's1', name: '영어', now: T0 });
    expect(state.subjects).toEqual([{ id: 's1', name: '영어', createdAt: T0, updatedAt: T0 }]);
  });

  it('이름을 바꾸면 수정 시각만 갱신된다', () => {
    const state = contentReducer(seed(), { type: 'subject/rename', id: 's1', name: '영단어', now: T1 });
    expect(state.subjects[0]).toEqual({ id: 's1', name: '영단어', createdAt: T0, updatedAt: T1 });
  });
});

describe('덱 관리', () => {
  it('덱을 다른 과목으로 옮겨도 카드와 일정은 그대로다', () => {
    const before = seed();
    const after = contentReducer(before, { type: 'deck/move', id: 'd1', subjectId: 's2', now: T1 });
    expect(after.decks.find((d) => d.id === 'd1')).toMatchObject({ subjectId: 's2', updatedAt: T1 });
    expect(after.cards.d1).toBe(before.cards.d1);
  });

  it('없는 과목으로 옮기면 상태가 바뀌지 않는다', () => {
    const before = seed();
    expect(contentReducer(before, { type: 'deck/move', id: 'd1', subjectId: 'nope', now: T1 })).toBe(before);
  });

  it('없는 과목에는 덱을 만들지 않는다', () => {
    const before = seed();
    expect(contentReducer(before, { type: 'deck/add', id: 'd9', subjectId: 'nope', name: '덱', now: T0 })).toBe(before);
  });
});

describe('카드 관리', () => {
  it('카드를 수정해도 일정은 그대로다', () => {
    const base = seed();
    // stage 3 카드로 가정
    const staged: ContentState = {
      ...base,
      cards: { ...base.cards, d1: base.cards.d1.map((c) => (c.id === 'c1' ? { ...c, schedule: { ...c.schedule, stage: 3, dueDate: '2026-11-09' } } : c)) },
    };
    const after = contentReducer(staged, {
      type: 'card/update', id: 'c1', deckId: 'd1', question: 'q-c1', answer: '새 정답', now: T1,
    });
    const c1 = after.cards.d1.find((c) => c.id === 'c1')!;
    expect(c1).toMatchObject({ answer: '새 정답', updatedAt: T1, createdAt: T0 });
    expect(c1.schedule).toEqual(staged.cards.d1[0].schedule);
  });

  it('카드를 삭제하면 나머지만 남는다', () => {
    const state = contentReducer(seed(), { type: 'card/delete', id: 'c1', deckId: 'd1' });
    expect(state.cards.d1.map((c) => c.id)).toEqual(['c2']);
  });

  it('신규 카드는 생성한 날 복습 예정인 초기 일정을 갖는다', () => {
    const state = contentReducer(seed(), card('c9', 'd1'));
    expect(state.cards.d1.at(-1)?.schedule).toEqual({
      stage: 0,
      dueDate: '2026-10-26',
      lastReviewedDate: null,
      reviewCount: 0,
      lapseCount: 0,
      algorithmId: 'fixed-interval',
      algorithmVersion: 1,
    });
  });
});

describe('연쇄 삭제', () => {
  it('과목을 지우면 그 과목의 덱과 카드가 함께 지워지고 다른 과목은 그대로다', () => {
    const before = seed();
    const after = contentReducer(before, { type: 'subject/delete', id: 's1' });
    expect(after.subjects.map((s) => s.id)).toEqual(['s2']);
    expect(after.decks.map((d) => d.id)).toEqual(['d3']);
    expect(Object.keys(after.cards)).toEqual(['d3']);
    expect(after.cards.d3).toBe(before.cards.d3);
  });

  it('덱을 지우면 그 덱의 카드가 함께 지워지고 같은 과목의 다른 덱은 그대로다', () => {
    const before = seed();
    const after = contentReducer(before, { type: 'deck/delete', id: 'd1' });
    expect(after.decks.map((d) => d.id)).toEqual(['d2', 'd3']);
    expect(after.cards.d1).toBeUndefined();
    expect(after.cards.d2).toBe(before.cards.d2);
  });
});

describe('참조 유지', () => {
  it('수정하지 않은 덱의 카드 배열과 목록 배열은 참조가 유지된다', () => {
    const before = seed();
    const after = contentReducer(before, { type: 'card/update', id: 'c3', deckId: 'd2', question: '새 질문', answer: 'a', now: T1 });
    expect(after.cards.d2).not.toBe(before.cards.d2);
    expect(after.cards.d1).toBe(before.cards.d1);
    expect(after.cards.d3).toBe(before.cards.d3);
    expect(after.subjects).toBe(before.subjects);
    expect(after.decks).toBe(before.decks);
  });
});
