import { describe, expect, it } from 'vitest';
import { validateCardText, validateName } from '../domain/validation';
import { deleteDeckDetail, deleteSubjectDetail, validationMessage } from './messages';

describe('messages', () => {
  it('사유·대상별 안내 문구', () => {
    expect(validationMessage('subjectName', validateName(' '))).toBe('과목 이름을 입력해 주세요');
    expect(validationMessage('deckName', validateName('a'.repeat(31)))).toBe('30자 이하로 입력해 주세요');
    expect(validationMessage('answer', validateCardText(''))).toBe('정답을 입력해 주세요');
    expect(validationMessage('question', validateCardText('a'.repeat(501)))).toBe('500자 이하로 입력해 주세요');
    expect(validationMessage('question', validateCardText('ok'))).toBeNull();
  });

  it('삭제 확인 문구는 함께 지워지는 수를 알린다', () => {
    expect(deleteSubjectDetail({ decks: 2, cards: 5 })).toBe('덱 2개·카드 5장도 함께 삭제돼요.');
    expect(deleteDeckDetail(3)).toBe('카드 3장도 함께 삭제돼요.');
  });
});
