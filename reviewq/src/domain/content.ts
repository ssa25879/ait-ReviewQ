import type { Card, Deck, ReviewLog, Subject } from './model';
import { ALGORITHM_ID, ALGORITHM_VERSION } from './scheduler/constants';
import { fixedIntervalScheduler } from './scheduler/fixedInterval';
import type { Grade } from './scheduler/types';
import { validateCardText, validateName } from './validation';

// 저장 키 구조와 같은 형태: bq:subjects, bq:decks, bq:cards:{deckId}, bq:logs:{YYYY-MM}
export interface ContentState {
  subjects: Subject[];
  decks: Deck[];
  cards: Record<string, Card[]>;
  logs: Record<string, ReviewLog[]>; // 'YYYY-MM' → 그 달의 판정 기록
}

export const emptyContent: ContentState = { subjects: [], decks: [], cards: {}, logs: {} };

// id·시각(now, ISO 8601)·오늘 날짜(today, YYYY-MM-DD)는 호출자가 채운다
export type ContentAction =
  | { type: 'content/replace'; state: ContentState }
  | { type: 'subject/add'; id: string; name: string; now: string }
  | { type: 'subject/rename'; id: string; name: string; now: string }
  | { type: 'subject/delete'; id: string }
  | { type: 'deck/add'; id: string; subjectId: string; name: string; now: string }
  | { type: 'deck/rename'; id: string; name: string; now: string }
  | { type: 'deck/move'; id: string; subjectId: string; now: string }
  | { type: 'deck/delete'; id: string }
  | { type: 'card/add'; id: string; deckId: string; question: string; answer: string; now: string; today: string }
  | { type: 'card/update'; id: string; deckId: string; question: string; answer: string; now: string }
  | { type: 'card/delete'; id: string; deckId: string }
  // date는 세션 날짜(YYYY-MM-DD), logId는 판정 기록 id
  | { type: 'card/review'; cardId: string; deckId: string; grade: Grade; date: string; now: string; logId: string };

// 검증 위반이나 없는 대상을 가리키는 액션은 상태를 그대로 돌려준다.
// 바뀌지 않은 배열은 참조를 유지한다(변경 키 계산이 참조 비교에 의존).
export function contentReducer(state: ContentState, action: ContentAction): ContentState {
  switch (action.type) {
    case 'content/replace':
      return action.state;

    case 'subject/add': {
      const name = validateName(action.name);
      if (!name.ok) return state;
      const subject: Subject = { id: action.id, name: name.value, createdAt: action.now, updatedAt: action.now };
      return { ...state, subjects: [...state.subjects, subject] };
    }

    case 'subject/rename': {
      const name = validateName(action.name);
      if (!name.ok || !state.subjects.some((s) => s.id === action.id)) return state;
      return {
        ...state,
        subjects: state.subjects.map((s) =>
          s.id === action.id ? { ...s, name: name.value, updatedAt: action.now } : s,
        ),
      };
    }

    case 'subject/delete': {
      if (!state.subjects.some((s) => s.id === action.id)) return state;
      const removedDeckIds = state.decks.filter((d) => d.subjectId === action.id).map((d) => d.id);
      return {
        ...state,
        subjects: state.subjects.filter((s) => s.id !== action.id),
        decks: removedDeckIds.length ? state.decks.filter((d) => d.subjectId !== action.id) : state.decks,
        cards: removedDeckIds.length ? omitKeys(state.cards, removedDeckIds) : state.cards,
      };
    }

    case 'deck/add': {
      const name = validateName(action.name);
      if (!name.ok || !state.subjects.some((s) => s.id === action.subjectId)) return state;
      const deck: Deck = {
        id: action.id,
        subjectId: action.subjectId,
        name: name.value,
        createdAt: action.now,
        updatedAt: action.now,
      };
      return { ...state, decks: [...state.decks, deck], cards: { ...state.cards, [deck.id]: [] } };
    }

    case 'deck/rename': {
      const name = validateName(action.name);
      if (!name.ok || !state.decks.some((d) => d.id === action.id)) return state;
      return {
        ...state,
        decks: state.decks.map((d) => (d.id === action.id ? { ...d, name: name.value, updatedAt: action.now } : d)),
      };
    }

    case 'deck/move': {
      const deck = state.decks.find((d) => d.id === action.id);
      if (!deck || deck.subjectId === action.subjectId) return state;
      if (!state.subjects.some((s) => s.id === action.subjectId)) return state;
      return {
        ...state,
        decks: state.decks.map((d) =>
          d.id === action.id ? { ...d, subjectId: action.subjectId, updatedAt: action.now } : d,
        ),
      };
    }

    case 'deck/delete': {
      if (!state.decks.some((d) => d.id === action.id)) return state;
      return {
        ...state,
        decks: state.decks.filter((d) => d.id !== action.id),
        cards: omitKeys(state.cards, [action.id]),
      };
    }

    case 'card/add': {
      const question = validateCardText(action.question);
      const answer = validateCardText(action.answer);
      if (!question.ok || !answer.ok || !state.decks.some((d) => d.id === action.deckId)) return state;
      const card: Card = {
        id: action.id,
        deckId: action.deckId,
        question: question.value,
        answer: answer.value,
        createdAt: action.now,
        updatedAt: action.now,
        schedule: {
          stage: 0,
          dueDate: action.today,
          lastReviewedDate: null,
          reviewCount: 0,
          lapseCount: 0,
          algorithmId: ALGORITHM_ID,
          algorithmVersion: ALGORITHM_VERSION,
        },
      };
      const deckCards = state.cards[action.deckId] ?? [];
      return { ...state, cards: { ...state.cards, [action.deckId]: [...deckCards, card] } };
    }

    case 'card/update': {
      const question = validateCardText(action.question);
      const answer = validateCardText(action.answer);
      const deckCards = state.cards[action.deckId];
      if (!question.ok || !answer.ok || !deckCards?.some((c) => c.id === action.id)) return state;
      return {
        ...state,
        cards: {
          ...state.cards,
          [action.deckId]: deckCards.map((c) =>
            c.id === action.id
              ? { ...c, question: question.value, answer: answer.value, updatedAt: action.now }
              : c,
          ),
        },
      };
    }

    case 'card/delete': {
      const deckCards = state.cards[action.deckId];
      if (!deckCards?.some((c) => c.id === action.id)) return state;
      return {
        ...state,
        cards: { ...state.cards, [action.deckId]: deckCards.filter((c) => c.id !== action.id) },
      };
    }

    // 일정이 바뀐 판정만 해당 덱 카드와 해당 월 로그를 갱신한다(같은 날 재판정은 상태 그대로)
    case 'card/review': {
      const deckCards = state.cards[action.deckId];
      const card = deckCards?.find((c) => c.id === action.cardId);
      if (!card) return state;
      const schedule = fixedIntervalScheduler.schedule(card.schedule, action.grade, action.date);
      if (schedule === card.schedule) return state;
      const log: ReviewLog = {
        id: action.logId,
        cardId: card.id,
        date: action.date,
        grade: action.grade,
        prevStage: card.schedule.stage,
        nextStage: schedule.stage,
        reviewedAt: action.now,
      };
      const month = action.date.slice(0, 7);
      return {
        ...state,
        cards: { ...state.cards, [action.deckId]: deckCards.map((c) => (c.id === card.id ? { ...c, schedule } : c)) },
        logs: { ...state.logs, [month]: [...(state.logs[month] ?? []), log] },
      };
    }
  }
}

function omitKeys<T>(record: Record<string, T>, keys: string[]): Record<string, T> {
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
}
