import { describe, expect, it } from 'vitest';
import { checkClock } from './clock';

describe('checkClock', () => {
  it('정상 진행이면 마지막으로 연 날을 오늘로 갱신한다', () => {
    expect(checkClock('2026-10-25', '2026-10-26')).toEqual({ rolledBack: false, lastOpenedDate: '2026-10-26' });
  });

  it('같은 날이면 되돌림이 아니다', () => {
    expect(checkClock('2026-10-26', '2026-10-26')).toEqual({ rolledBack: false, lastOpenedDate: '2026-10-26' });
  });

  it('되돌림이면 마지막으로 연 날을 유지한다(S-10)', () => {
    expect(checkClock('2026-10-26', '2026-10-20')).toEqual({ rolledBack: true, lastOpenedDate: '2026-10-26' });
  });

  it('날짜를 바로잡으면 되돌림이 풀린다', () => {
    const first = checkClock('2026-10-26', '2026-10-20');
    expect(checkClock(first.lastOpenedDate, '2026-10-26')).toEqual({ rolledBack: false, lastOpenedDate: '2026-10-26' });
  });
});
