import { describe, expect, it } from 'vitest';
import { BULK_MAX_LINES, parseBulkCards } from './bulkCards';

describe('parseBulkCards', () => {
  it('세 가지 구분자를 받고 앞뒤 공백을 지운다', () => {
    const r = parseBulkCards('apple / 사과\n banana | 바나나 \ncherry\t체리');
    expect(r.cards).toEqual([
      { line: 1, question: 'apple', answer: '사과' },
      { line: 2, question: 'banana', answer: '바나나' },
      { line: 3, question: 'cherry', answer: '체리' },
    ]);
    expect(r.errors).toEqual([]);
    expect(r.tooMany).toBe(false);
  });

  it('탭 > " / " > "|" 순서로 첫 구분자 하나만 쓴다', () => {
    expect(parseBulkCards('a / b\tc').cards[0]).toMatchObject({ question: 'a / b', answer: 'c' });
    expect(parseBulkCards('a | b / c').cards[0]).toMatchObject({ question: 'a | b', answer: 'c' });
    expect(parseBulkCards('비율 / 3 / 4').cards[0]).toMatchObject({ question: '비율', answer: '3 / 4' });
  });

  it('빈 줄은 건너뛰고 줄 번호는 원래 줄을 따른다(\\r\\n 포함)', () => {
    const r = parseBulkCards('\r\na / b\r\n   \r\nc / d\r\n');
    expect(r.cards.map((c) => c.line)).toEqual([2, 4]);
  });

  it('오류 이유를 줄 번호와 함께 돌려준다', () => {
    const r = parseBulkCards('구분자 없는 줄\n / 정답만\n질문만 / \nok / 좋음');
    expect(r.errors).toEqual([
      { line: 1, text: '구분자 없는 줄', reason: 'noSeparator' },
      { line: 2, text: ' / 정답만', reason: 'emptyQuestion' },
      { line: 3, text: '질문만 / ', reason: 'emptyAnswer' },
    ]);
    expect(r.cards).toHaveLength(1);
  });

  it('질문·정답 500자까지 허용하고 넘으면 tooLong', () => {
    expect(parseBulkCards(`${'가'.repeat(500)} / ${'나'.repeat(500)}`).cards).toHaveLength(1);
    expect(parseBulkCards(`q / ${'나'.repeat(501)}`).errors[0].reason).toBe('tooLong');
  });

  it('빈 줄을 뺀 줄이 200줄을 넘으면 tooMany', () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `q${i} / a${i}`).join('\n\n');
    expect(parseBulkCards(lines(BULK_MAX_LINES)).tooMany).toBe(false);
    expect(parseBulkCards(lines(BULK_MAX_LINES + 1)).tooMany).toBe(true);
  });
});
