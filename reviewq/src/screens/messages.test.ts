import { describe, expect, it } from 'vitest';
import { validateCardText, validateName } from '../domain/validation';
import {
  clockWarning,
  deleteDeckDetail,
  deleteSubjectDetail,
  dueTodayLabel,
  overflowNotice,
  progressLabel,
  rememberedPercent,
  stageLabel,
  validationMessage,
} from './messages';

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

  it('오늘 복습 수 문구와 기억함 비율', () => {
    expect(dueTodayLabel(0)).toBe('오늘 복습할 카드가 없어요');
    expect(dueTodayLabel(2)).toBe('오늘 복습 2장');
    expect(rememberedPercent(1, 2)).toBe(50);
    expect(rememberedPercent(2, 3)).toBe(67);
    expect(rememberedPercent(0, 0)).toBe(0);
    expect(progressLabel(1, 3)).toBe('3장 중 1번째');
  });
});

describe('홈·상한 문구', () => {
  it('상한 초과 안내와 시계 경고', () => {
    expect(overflowNotice(30)).toBe('오늘은 100장까지 학습해요. 나머지 30장은 내일 이어서 나와요.');
    expect(clockWarning('2026-10-26')).toBe('기기 날짜가 마지막으로 앱을 연 날(10월 26일)보다 이전이에요. 날짜 설정을 확인해 주세요.');
  });
});

describe('통계 문구', () => {
  it('단계 라벨', () => {
    expect([0, 1, 3, 6].map(stageLabel)).toEqual(['새 카드·다시 학습', '1일 간격', '7일 간격', '60일 간격']);
  });
});
