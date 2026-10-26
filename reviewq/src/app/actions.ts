import type { ContentAction } from '../domain/content';
import { todayLocal } from '../utils/date';
import { newId } from '../utils/id';

export interface ActionEnv {
  newId: () => string;
  now: () => Date;
}

const defaultEnv: ActionEnv = { newId, now: () => new Date() };

// 리듀서를 순수하게 두기 위해 id·시각·오늘 날짜를 여기서 채운다
export function createActions(env: ActionEnv = defaultEnv) {
  const iso = () => env.now().toISOString();
  return {
    addSubject: (name: string): ContentAction => ({ type: 'subject/add', id: env.newId(), name, now: iso() }),
    renameSubject: (id: string, name: string): ContentAction => ({ type: 'subject/rename', id, name, now: iso() }),
    deleteSubject: (id: string): ContentAction => ({ type: 'subject/delete', id }),
    addDeck: (subjectId: string, name: string): ContentAction => ({
      type: 'deck/add', id: env.newId(), subjectId, name, now: iso(),
    }),
    renameDeck: (id: string, name: string): ContentAction => ({ type: 'deck/rename', id, name, now: iso() }),
    moveDeck: (id: string, subjectId: string): ContentAction => ({ type: 'deck/move', id, subjectId, now: iso() }),
    deleteDeck: (id: string): ContentAction => ({ type: 'deck/delete', id }),
    addCard: (deckId: string, question: string, answer: string): ContentAction => {
      const now = env.now();
      return {
        type: 'card/add', id: env.newId(), deckId, question, answer, now: now.toISOString(), today: todayLocal(now),
      };
    },
    updateCard: (id: string, deckId: string, question: string, answer: string): ContentAction => ({
      type: 'card/update', id, deckId, question, answer, now: iso(),
    }),
    deleteCard: (id: string, deckId: string): ContentAction => ({ type: 'card/delete', id, deckId }),
  };
}

export const actions = createActions();
