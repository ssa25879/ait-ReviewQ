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

export interface Meta {
  schemaVersion: number;
  lastOpenedDate: string; // 'YYYY-MM-DD'
  installId: string;
}
