import { describe, expect, it } from 'vitest';
import { addDays, isDue, todayLocal } from './date';

describe('todayLocal', () => {
  it('로컬 날짜를 YYYY-MM-DD로 돌려준다', () => {
    expect(todayLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('로컬 자정 직전도 같은 날짜로 본다', () => {
    expect(todayLocal(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });
});

describe('addDays', () => {
  it('월말을 넘긴다 (S-07)', () => {
    expect(addDays('2026-01-31', 30)).toBe('2026-03-02');
  });

  it('윤년 2월과 연말을 넘긴다 (S-08)', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('평년 2월 28일 다음은 3월 1일이다', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('isDue', () => {
  it('예정일이 기준일과 같거나 이전이면 대상이다', () => {
    expect(isDue('2026-10-26', '2026-10-26')).toBe(true);
    expect(isDue('2026-10-25', '2026-10-26')).toBe(true);
    expect(isDue('2026-09-30', '2026-10-01')).toBe(true);
  });

  it('예정일이 기준일 이후면 대상이 아니다', () => {
    expect(isDue('2026-10-27', '2026-10-26')).toBe(false);
    expect(isDue('2027-01-01', '2026-12-31')).toBe(false);
  });
});
