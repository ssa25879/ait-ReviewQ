import { describe, expect, it } from 'vitest';
import { todayLocal } from './date';

describe('todayLocal', () => {
  it('로컬 날짜를 YYYY-MM-DD로 돌려준다', () => {
    expect(todayLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('로컬 자정 직전도 같은 날짜로 본다', () => {
    expect(todayLocal(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });
});
