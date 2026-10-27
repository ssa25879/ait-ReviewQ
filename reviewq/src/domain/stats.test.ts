import { describe, expect, it } from 'vitest';
import { type ContentAction, type ContentState, contentReducer, emptyContent } from './content';
import type { ReviewLog } from './model';
import { buildQueue } from './queue';
import { flip, isFinished, judge, startSession } from './session';
import { recentDailyCounts, stageDistribution, todayDoneCount, totalCardCount } from './stats';

const T = '2026-10-26T00:00:00.000Z';
const TODAY = '2026-10-26';
const base = (
  [
    { type: 'subject/add', id: 's1', name: '영어', now: T },
    { type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: T },
    ...['c1', 'c2', 'c3', 'c4'].map((id) => ({
      type: 'card/add', id, deckId: 'd1', question: 'q', answer: 'a', now: T, today: TODAY,
    })),
  ] as ContentAction[]
).reduce(contentReducer, emptyContent);

const log = (id: string, date: string): ReviewLog => ({
  id, cardId: 'c1', date, grade: 'remember', prevStage: 0, nextStage: 1, reviewedAt: T,
});
const withLogs = (logs: ReviewLog[]): ContentState => ({
  ...emptyContent,
  logs: logs.reduce<Record<string, ReviewLog[]>>((acc, l) => {
    (acc[l.date.slice(0, 7)] ??= []).push(l);
    return acc;
  }, {}),
});

describe('stats', () => {
  it('오늘 3장 판정(1장 재출제 후 재판정) → 오늘 완료 3', () => {
    let state = base;
    let session = startSession(buildQueue(state, TODAY, { deckId: 'd1' }).cards.slice(0, 3), TODAY);
    const grades = ['forget', 'remember', 'remember', 'remember'] as const; // 마지막은 재출제 카드
    let n = 0;
    for (const grade of grades) {
      const result = judge(flip(session), grade);
      if (result.apply) {
        const { cardId, deckId, date } = result.apply;
        state = contentReducer(state, { type: 'card/review', cardId, deckId, grade, date, now: T, logId: `l${n++}` });
      }
      session = result.session;
    }
    expect(isFinished(session)).toBe(true);
    expect(todayDoneCount(state, TODAY)).toBe(3);
  });

  it('단계 분포 합은 전체 카드 수', () => {
    const stages = [0, 0, 1, 3];
    const state: ContentState = {
      ...base,
      cards: { d1: base.cards.d1.map((c, i) => ({ ...c, schedule: { ...c.schedule, stage: stages[i] } })) },
    };
    const dist = stageDistribution(state);
    expect(dist).toEqual([2, 1, 0, 1, 0, 0, 0]);
    expect(dist.reduce((a, b) => a + b, 0)).toBe(4);
    expect(totalCardCount(state)).toBe(4);
  });

  it('손상된 stage(범위 밖·비정수·NaN·숫자 아님)도 한 단계에 들어가 합이 전체 카드 수와 같다', () => {
    const raw = [-1, 9, 2.7, Number.NaN, Number.POSITIVE_INFINITY, undefined];
    const cards = raw.map((stage, i) => ({ ...base.cards.d1[0], id: `x${i}`, schedule: { ...base.cards.d1[0].schedule, stage: stage as number } }));
    const state: ContentState = { ...base, cards: { d1: cards } };
    const dist = stageDistribution(state);
    expect(dist).toEqual([3, 0, 1, 0, 0, 0, 2]); // -1·NaN·undefined → 0, 2.7 → 2, 9·Infinity → 6
    expect(dist.reduce((a, b) => a + b, 0)).toBe(totalCardCount(state));
    expect(totalCardCount(state)).toBe(6);
  });

  it('월 경계 7일: 10-27~11-02, 10-26 제외', () => {
    const state = withLogs([
      log('a', '2026-10-30'), log('b', '2026-10-30'), log('c', '2026-11-01'),
      ...['d', 'e', 'f', 'g', 'h'].map((id) => log(id, '2026-10-26')),
    ]);
    expect(recentDailyCounts(state, '2026-11-02')).toEqual([
      { date: '2026-10-27', count: 0 },
      { date: '2026-10-28', count: 0 },
      { date: '2026-10-29', count: 0 },
      { date: '2026-10-30', count: 2 },
      { date: '2026-10-31', count: 0 },
      { date: '2026-11-01', count: 1 },
      { date: '2026-11-02', count: 0 },
    ]);
  });

  it('빈 상태는 모두 0', () => {
    expect(todayDoneCount(emptyContent, TODAY)).toBe(0);
    expect(stageDistribution(emptyContent)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(totalCardCount(emptyContent)).toBe(0);
    expect(recentDailyCounts(emptyContent, TODAY).map((d) => d.count)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
