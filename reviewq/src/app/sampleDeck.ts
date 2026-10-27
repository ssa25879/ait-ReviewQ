import type { ContentAction } from '../domain/content';
import { SAMPLE_CARDS, SAMPLE_DECK, SAMPLE_SUBJECT } from '../domain/sampleDeck';
import { actions } from './actions';

// 예시 과목·단원·카드를 만드는 액션 목록(홈 첫 사용 안내와 가이드 마지막 장이 함께 쓴다)
export function sampleDeckActions(): ContentAction[] {
  const subject = actions.addSubject(SAMPLE_SUBJECT) as Extract<ContentAction, { type: 'subject/add' }>;
  const deck = actions.addDeck(subject.id, SAMPLE_DECK) as Extract<ContentAction, { type: 'deck/add' }>;
  return [subject, deck, ...SAMPLE_CARDS.map(([question, answer]) => actions.addCard(deck.id, question, answer))];
}
