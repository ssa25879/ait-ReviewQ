// 테스트 빌드(VITE_DEMO_DATA=true) 전용 데모 데이터. 설정의 DemoSection에서만 동적으로 불러와 출시 빌드에는 들어가지 않는다
import { type ContentAction, contentReducer, emptyContent } from '../domain/content';
import type { Grade } from '../domain/scheduler/types';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportDoc } from '../infra/storage/exportData';
import { SCHEMA_VERSION } from '../infra/storage/meta';
import { addDays } from '../utils/date';

const DEMO: Record<string, Record<string, [string, string][]>> = {
  영어: {
    '토익 단어': [
      ['abandon', '버리다, 포기하다'], ['benefit', '이익, 혜택'], ['candidate', '후보자'], ['deadline', '마감 기한'],
      ['efficient', '효율적인'], ['feature', '특징, 기능'], ['guarantee', '보장하다'], ['hesitate', '망설이다'],
      ['inventory', '재고'], ['negotiate', '협상하다'], ['postpone', '미루다, 연기하다'], ['reliable', '믿을 수 있는'],
    ],
  },
  한국사: {
    근현대사: [
      ['갑오개혁 연도', '1894년'], ['3·1 운동 연도', '1919년'], ['대한민국 임시정부 수립지', '상하이'],
      ['광복 날짜', '1945년 8월 15일'], ['6·25 전쟁 발발', '1950년 6월 25일'], ['4·19 혁명 연도', '1960년'],
    ],
  },
  수학: {
    공식: [
      ['근의 공식', 'x = (-b ± √(b²-4ac)) / 2a'], ['원의 넓이', 'πr²'], ['피타고라스 정리', 'a² + b² = c²'], ['등차수열 합', 'n(a + l) / 2'],
    ],
  },
};

// 카드 순서별 판정 이력(오늘 기준 며칠 전, 판정). 여러 단계·미래 복습일·오늘 복습·최근 7일 기록이 생기도록 섞는다
const HISTORIES: [daysAgo: number, grade: Grade][][] = [
  [[7, 'remember'], [6, 'remember'], [3, 'remember']], // 3단계, 다음 복습일이 미래
  [[2, 'remember']], // 1단계, 어제가 예정일 → 오늘 복습(연체)
  [[1, 'forget']], // 초기화, 오늘 복습
  [], // 판정 없음, 오늘 복습
  [[0, 'remember']], // 오늘 학습, 내일 복습
];

// 데모 데이터를 내보내기 형식으로 만든다(백업 가져오기와 같은 교체 경로로 넣는다)
export function buildDemoDoc(today: string, newId: () => string, now: Date = new Date()): ExportDoc {
  const start = addDays(today, -10);
  const at = (date: string) => `${date}T09:00:00.000Z`;
  const actions: ContentAction[] = [];
  const reviews: { date: string; action: ContentAction }[] = [];
  let index = 0;
  for (const [subjectName, decks] of Object.entries(DEMO)) {
    const subjectId = newId();
    actions.push({ type: 'subject/add', id: subjectId, name: subjectName, now: at(start) });
    for (const [deckName, cards] of Object.entries(decks)) {
      const deckId = newId();
      actions.push({ type: 'deck/add', id: deckId, subjectId, name: deckName, now: at(start) });
      for (const [question, answer] of cards) {
        const cardId = newId();
        actions.push({ type: 'card/add', id: cardId, deckId, question, answer, now: at(start), today: start });
        for (const [daysAgo, grade] of HISTORIES[index++ % HISTORIES.length]) {
          const date = addDays(today, -daysAgo);
          reviews.push({ date, action: { type: 'card/review', cardId, deckId, grade, date, now: at(date), logId: newId() } });
        }
      }
    }
  }
  // 판정은 날짜 순서대로 적용해야 스케줄러가 실제 학습과 같은 단계를 만든다
  reviews.sort((a, b) => a.date.localeCompare(b.date));
  const content = [...actions, ...reviews.map((r) => r.action)].reduce(contentReducer, emptyContent);
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    schemaVersion: SCHEMA_VERSION,
    subjects: content.subjects,
    decks: content.decks,
    cards: content.cards,
    logs: Object.fromEntries(Object.entries(content.logs).filter(([, logs]) => logs.length > 0)),
  };
}
