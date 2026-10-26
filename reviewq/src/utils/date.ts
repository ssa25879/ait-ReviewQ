// 기기 로컬 날짜를 'YYYY-MM-DD'로 돌려준다(UTC 변환 없음)
export function todayLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
