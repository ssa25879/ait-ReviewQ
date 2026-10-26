import { addDays } from '../utils/date';
import type { ContentState } from './content';
import type { QueueItem } from './queue';
import type { Grade } from './scheduler/types';

// 화면 수명 동안만 쓰는 세션 상태(저장하지 않는다)
export interface SessionState {
  date: string; // 세션 시작 날짜. 자정이 지나도 바꾸지 않는다
  order: QueueItem[]; // 기억 못 한 카드의 재출제 포함
  index: number;
  flipped: boolean;
  firstGrades: Record<string, Grade>; // cardId → 세션 첫 판정
}

// 일정에 반영할 판정. 첫 판정일 때만 생긴다
export interface ReviewApply extends QueueItem {
  grade: Grade;
  date: string;
}

export function startSession(queue: QueueItem[], date: string): SessionState {
  return { date, order: [...queue], index: 0, flipped: false, firstGrades: {} };
}

export function isFinished(session: SessionState): boolean {
  return session.index >= session.order.length;
}

export function currentItem(session: SessionState): QueueItem | undefined {
  return session.order[session.index];
}

export function flip(session: SessionState): SessionState {
  if (isFinished(session) || session.flipped) return session;
  return { ...session, flipped: true };
}

// 뒤집기 전이나 세션이 끝난 뒤의 판정은 무시한다.
// 첫 판정만 apply를 돌려주고, 첫 판정이 기억 못 함이면 끝에 1회 재출제한다
export function judge(session: SessionState, grade: Grade): { session: SessionState; apply?: ReviewApply } {
  const item = currentItem(session);
  if (!item || !session.flipped) return { session };

  const next = { ...session, index: session.index + 1, flipped: false };
  if (item.cardId in session.firstGrades) return { session: next };

  next.firstGrades = { ...session.firstGrades, [item.cardId]: grade };
  if (grade === 'forget') next.order = [...session.order, item];
  return { session: next, apply: { ...item, grade, date: session.date } };
}

// 현재 몇 번째 카드인지와 전체 수(재출제 포함)
export function progress(session: SessionState): { current: number; total: number } {
  const total = session.order.length;
  return { current: Math.min(session.index + 1, total), total };
}

export interface SessionSummary {
  completed: number; // 일정에 반영된 판정 수
  remembered: number;
  dueTomorrow: number; // 세션 날짜 다음 날이 예정일인 카드 수(전체 덱)
}

export function summarize(session: SessionState, state: ContentState): SessionSummary {
  const grades = Object.values(session.firstGrades);
  const tomorrow = addDays(session.date, 1);
  return {
    completed: grades.length,
    remembered: grades.filter((g) => g === 'remember').length,
    dueTomorrow: Object.values(state.cards)
      .flat()
      .filter((c) => c.schedule.dueDate === tomorrow).length,
  };
}
