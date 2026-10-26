import { describe, expect, it } from 'vitest';
import { validateCardText, validateName } from './validation';

describe('validateName', () => {
  it('공백만 입력하면 empty', () => {
    expect(validateName('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('앞뒤 공백을 제거한 30자는 통과하고 제거된 값을 돌려준다', () => {
    const name = 'a'.repeat(30);
    expect(validateName(`  ${name} `)).toEqual({ ok: true, value: name });
  });

  it('31자는 tooLong', () => {
    expect(validateName('가'.repeat(31))).toEqual({ ok: false, reason: 'tooLong' });
  });
});

describe('validateCardText', () => {
  it('비어 있으면 empty', () => {
    expect(validateCardText('')).toEqual({ ok: false, reason: 'empty' });
  });

  it('내부 줄바꿈은 유지한다', () => {
    expect(validateCardText('\n첫 줄\n둘째 줄\n')).toEqual({ ok: true, value: '첫 줄\n둘째 줄' });
  });

  it('이모지 500개는 500자로 세어 통과한다', () => {
    const text = '😀'.repeat(500);
    expect(validateCardText(text)).toEqual({ ok: true, value: text });
    expect(validateCardText(text + '😀')).toEqual({ ok: false, reason: 'tooLong' });
  });
});
