import { CARD_TEXT_MAX, NAME_MAX, type ValidationResult } from '../domain/validation';

export type Field = 'subjectName' | 'deckName' | 'question' | 'answer';

const FIELD_OBJECT: Record<Field, string> = {
  subjectName: '과목 이름을',
  deckName: '덱 이름을',
  question: '질문을',
  answer: '정답을',
};

const FIELD_MAX: Record<Field, number> = {
  subjectName: NAME_MAX,
  deckName: NAME_MAX,
  question: CARD_TEXT_MAX,
  answer: CARD_TEXT_MAX,
};

// 검증 실패 사유를 입력란 안내 문구로 바꾼다. 통과면 null
export function validationMessage(field: Field, result: ValidationResult): string | null {
  if (result.ok) return null;
  return result.reason === 'empty'
    ? `${FIELD_OBJECT[field]} 입력해 주세요`
    : `${FIELD_MAX[field]}자 이하로 입력해 주세요`;
}

export const DUPLICATE_DECK_WARNING = '이 과목에 같은 이름의 덱이 있어요';

export function deleteSubjectDetail({ decks, cards }: { decks: number; cards: number }): string {
  if (decks === 0) return '이 과목에는 덱이 없어요.';
  return `덱 ${decks}개·카드 ${cards}장도 함께 삭제돼요.`;
}

export function deleteDeckDetail(cards: number): string {
  return cards === 0 ? '이 덱에는 카드가 없어요.' : `카드 ${cards}장도 함께 삭제돼요.`;
}
