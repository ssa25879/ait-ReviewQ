import { describe, expect, it } from 'vitest';
import { addDays } from '../../utils/date';
import { INTERVALS, fixedIntervalScheduler } from './fixedInterval';
import type { CardSchedule } from './types';

const { schedule } = fixedIntervalScheduler;

function sched(overrides: Partial<CardSchedule> = {}): CardSchedule {
  return {
    stage: 0,
    dueDate: '2026-10-26',
    lastReviewedDate: null,
    reviewCount: 0,
    lapseCount: 0,
    algorithmId: 'fixed-interval',
    algorithmVersion: 1,
    ...overrides,
  };
}

describe('fixedIntervalScheduler', () => {
  it('간격표는 1·3·7·14·30·60일이다', () => {
    expect(INTERVALS).toEqual([1, 3, 7, 14, 30, 60]);
  });

  it('신규 카드를 기억함으로 판정하면 stage 1, 다음 날 복습 (S-01)', () => {
    expect(schedule(sched(), 'remember', '2026-10-26')).toMatchObject({ stage: 1, dueDate: '2026-10-27' });
  });

  it('예정일마다 기억함이면 간격이 1→3→7→14→30→60일로 늘어난다 (S-02)', () => {
    let s = sched();
    let day = '2026-10-26';
    for (const gap of [1, 3, 7, 14, 30, 60]) {
      s = schedule(s, 'remember', day);
      expect(s.dueDate).toBe(addDays(day, gap));
      day = s.dueDate;
    }
    expect(s.stage).toBe(6);
  });

  it('stage 6에서 기억함이면 stage 6 유지, 판정일 + 60일 (S-03)', () => {
    expect(schedule(sched({ stage: 6, dueDate: '2026-10-26' }), 'remember', '2026-10-26')).toMatchObject({
      stage: 6,
      dueDate: '2026-12-25',
    });
  });

  it('기억 못 함이면 stage 0, 다음 날, 실패 횟수 +1 (S-04)', () => {
    expect(schedule(sched({ stage: 4, lapseCount: 2 }), 'forget', '2026-10-26')).toMatchObject({
      stage: 0,
      dueDate: '2026-10-27',
      lapseCount: 3,
    });
  });

  it('10일 연체된 stage 3 카드도 한 단계만 올라 판정일 + 14일 (S-05)', () => {
    const s = sched({ stage: 3, dueDate: '2026-10-16', lastReviewedDate: '2026-10-09' });
    expect(schedule(s, 'remember', '2026-10-26')).toMatchObject({ stage: 4, dueDate: '2026-11-09' });
  });

  it('같은 날 두 번째 판정은 반영하지 않고 같은 참조를 돌려준다 (S-06)', () => {
    const first = schedule(sched(), 'remember', '2026-10-26');
    const second = schedule(first, 'forget', '2026-10-26');
    expect(second).toBe(first);
    expect(second).toMatchObject({ stage: 1, dueDate: '2026-10-27', lapseCount: 0, reviewCount: 1 });
  });

  it('판정 후 직전 복습일·복습 횟수·알고리즘을 갱신한다', () => {
    const s = sched({ reviewCount: 2, algorithmId: 'old', algorithmVersion: 0 });
    expect(schedule(s, 'remember', '2026-10-26')).toMatchObject({
      lastReviewedDate: '2026-10-26',
      reviewCount: 3,
      algorithmId: 'fixed-interval',
      algorithmVersion: 1,
    });
    expect(schedule(s, 'forget', '2026-10-26')).toMatchObject({ lastReviewedDate: '2026-10-26', reviewCount: 3 });
  });

  it('직전 복습일보다 과거 날짜로 판정해도 판정일 기준으로 정상 계산한다 (S-10)', () => {
    const s = sched({ stage: 2, dueDate: '2026-11-02', lastReviewedDate: '2026-10-26', reviewCount: 2 });
    const next = schedule(s, 'remember', '2026-10-20');
    expect(next).toEqual({
      ...s,
      stage: 3,
      dueDate: '2026-10-27',
      lastReviewedDate: '2026-10-20',
      reviewCount: 3,
    });
    expect(next.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
