import { validateCardText } from './validation';

// 한 번에 추가할 수 있는 줄 수(빈 줄 제외)
export const BULK_MAX_LINES = 200;

export type BulkLineError = 'noSeparator' | 'emptyQuestion' | 'emptyAnswer' | 'tooLong';

export interface BulkParse {
  cards: { line: number; question: string; answer: string }[]; // line은 1부터 센 원래 줄 번호
  errors: { line: number; text: string; reason: BulkLineError }[];
  tooMany: boolean; // 빈 줄을 뺀 줄이 BULK_MAX_LINES를 넘는다
}

// 줄마다 탭 → " / " → "|" 순으로 첫 구분자 하나만으로 나눈다(정답 안의 구분자는 그대로 둔다)
function split(line: string): [string, string] | null {
  for (const sep of ['\t', ' / ', '|']) {
    const at = line.indexOf(sep);
    if (at >= 0) return [line.slice(0, at), line.slice(at + sep.length)];
  }
  return null;
}

// 붙여넣은 글을 한 줄에 카드 한 장으로 해석한다. 길이 검사는 카드 편집 화면과 같은 기준이다
export function parseBulkCards(text: string): BulkParse {
  const result: BulkParse = { cards: [], errors: [], tooMany: false };
  let count = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    if (raw.trim() === '') return;
    count++;
    const line = i + 1;
    const parts = split(raw);
    if (!parts) {
      result.errors.push({ line, text: raw, reason: 'noSeparator' });
      return;
    }
    const question = validateCardText(parts[0]);
    const answer = validateCardText(parts[1]);
    if (!question.ok && question.reason === 'empty') result.errors.push({ line, text: raw, reason: 'emptyQuestion' });
    else if (!answer.ok && answer.reason === 'empty') result.errors.push({ line, text: raw, reason: 'emptyAnswer' });
    else if (!question.ok || !answer.ok) result.errors.push({ line, text: raw, reason: 'tooLong' });
    else result.cards.push({ line, question: question.value, answer: answer.value });
  });
  result.tooMany = count > BULK_MAX_LINES;
  return result;
}
