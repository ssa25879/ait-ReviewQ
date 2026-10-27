import type { CardSchedule, Grade } from './scheduler/types';

export interface Subject {
  id: string;
  name: string; // 1~30자
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export interface Deck {
  id: string;
  subjectId: string;
  name: string; // 1~30자
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  deckId: string;
  question: string; // 1~500자
  answer: string; // 1~500자
  createdAt: string;
  updatedAt: string;
  schedule: CardSchedule;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  date: string; // 'YYYY-MM-DD' (세션 시작 날짜)
  grade: Grade;
  prevStage: number;
  nextStage: number;
  reviewedAt: string; // ISO 8601
}

// 복습 알림 동의 기록(기획서 9.4.6)
export interface NotificationConsent {
  agreed: boolean; // 마지막 응답이 동의였는지
  agreedAt?: string; // 동의 시각(ISO 8601)
  lastAskedAt: string; // 마지막으로 동의 창을 띄운 시각(ISO 8601)
}

export interface Meta {
  schemaVersion: number;
  lastOpenedDate: string; // 'YYYY-MM-DD'
  installId: string;
  notification?: NotificationConsent; // 없으면 아직 묻지 않음(v2부터)
}
