export const NAME_MAX = 30;
export const CARD_TEXT_MAX = 500;

export type ValidationResult = { ok: true; value: string } | { ok: false; reason: 'empty' | 'tooLong' };

// 앞뒤 공백을 제거한 뒤 코드 포인트 단위로 길이를 센다(이모지 1개 = 1자). 화면 글자 수 표시도 같은 기준을 쓴다
export function countChars(input: string): number {
  return [...input.trim()].length;
}

function validateText(input: string, max: number): ValidationResult {
  const value = input.trim();
  const length = countChars(value);
  if (length === 0) return { ok: false, reason: 'empty' };
  if (length > max) return { ok: false, reason: 'tooLong' };
  return { ok: true, value };
}

// 과목명·덱명
export function validateName(input: string): ValidationResult {
  return validateText(input, NAME_MAX);
}

// 카드 질문·정답(내부 줄바꿈 허용)
export function validateCardText(input: string): ValidationResult {
  return validateText(input, CARD_TEXT_MAX);
}
