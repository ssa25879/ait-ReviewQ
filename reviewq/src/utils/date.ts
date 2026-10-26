// 기기 로컬 날짜를 'YYYY-MM-DD'로 돌려준다(UTC 변환 없음)
export function todayLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 'YYYY-MM-DD'에 달력 일수를 더한다. UTC 자정 기준이라 시간대·일광절약시간 영향이 없다
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// 'YYYY-MM-DD'는 사전순 비교가 날짜 순서와 같다
export function isDue(dueDate: string, today: string): boolean {
  return dueDate <= today;
}
