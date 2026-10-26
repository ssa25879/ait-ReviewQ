export type Grade = 'remember' | 'forget';

export interface CardSchedule {
  stage: number; // 0 = 신규·초기화
  dueDate: string; // 'YYYY-MM-DD'
  lastReviewedDate: string | null;
  reviewCount: number;
  lapseCount: number;
  algorithmId: string; // 예: 'fixed-interval'
  algorithmVersion: number; // 예: 1
}

export interface Scheduler {
  id: string;
  schedule(state: CardSchedule, grade: Grade, today: string): CardSchedule;
}
