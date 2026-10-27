import { addDays } from '../utils/date';
import type { ContentState } from './content';
import { INTERVALS } from './scheduler/fixedInterval';

// 판정 기록은 'YYYY-MM' 월 키에 들어 있다
function logsOn(state: ContentState, date: string): number {
  return (state.logs[date.slice(0, 7)] ?? []).filter((log) => log.date === date).length;
}

// 오늘 완료 수: 오늘 날짜로 남은 판정 기록 수(재출제 판정은 기록이 남지 않는다)
export function todayDoneCount(state: ContentState, today: string): number {
  return logsOn(state, today);
}

// 전체 카드 수
export function totalCardCount(state: ContentState): number {
  return Object.values(state.cards).reduce((n, cards) => n + cards.length, 0);
}

// 단계별 카드 수. 인덱스 0은 새 카드·다시 학습, 1~6은 간격 1·3·7·14·30·60일 단계.
// 저장값이 손상돼도 모든 카드가 어느 단계에 들어가도록, 정수가 아니면 소수점을 버리고 NaN 등은 0으로 본 뒤 0~6으로 자른다
export function stageDistribution(state: ContentState): number[] {
  const counts = Array<number>(INTERVALS.length + 1).fill(0);
  for (const card of Object.values(state.cards).flat()) {
    const raw = Math.trunc(card.schedule.stage);
    const stage = Number.isNaN(raw) ? 0 : Math.min(Math.max(raw, 0), INTERVALS.length);
    counts[stage]++;
  }
  return counts;
}

// 오늘 포함 최근 days일의 날짜별 판정 기록 수(오래된 날부터). 월 경계는 날짜마다 월 키를 찾아 센다
export function recentDailyCounts(
  state: ContentState,
  today: string,
  days = 7,
): { date: string; count: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - (days - 1));
    return { date, count: logsOn(state, date) };
  });
}
