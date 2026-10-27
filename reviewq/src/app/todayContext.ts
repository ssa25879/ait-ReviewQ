import { createContext, useContext } from 'react';

export interface TodayValue {
  today: string; // 기기 로컬 오늘 'YYYY-MM-DD'
  clockRolledBack: boolean; // 오늘이 마지막으로 연 날보다 이전인지
  lastOpenedDate: string; // 저장된 마지막으로 연 날
}

export const TodayContext = createContext<TodayValue | null>(null);

export function useToday(): TodayValue {
  const value = useContext(TodayContext);
  if (!value) throw new Error('useToday는 TodayProvider 안에서만 쓸 수 있다');
  return value;
}
