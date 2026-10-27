export interface ClockCheck {
  rolledBack: boolean; // 기기 날짜가 마지막으로 연 날보다 이전인지
  lastOpenedDate: string; // 판정 후 저장할 마지막으로 연 날
}

// 오늘이 마지막으로 연 날보다 이전이면 시계 되돌림으로 보고 마지막으로 연 날을 그대로 둔다.
// 아니면 마지막으로 연 날을 오늘로 옮긴다('YYYY-MM-DD'는 사전순이 날짜 순서와 같다)
export function checkClock(lastOpenedDate: string, today: string): ClockCheck {
  if (today < lastOpenedDate) return { rolledBack: true, lastOpenedDate };
  return { rolledBack: false, lastOpenedDate: today };
}
