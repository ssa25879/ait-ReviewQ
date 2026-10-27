import { DAILY_LIMIT } from '../domain/queue';
import { INTERVALS } from '../domain/scheduler/fixedInterval';
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

export function dueTodayLabel(count: number): string {
  return count === 0 ? '오늘 복습할 카드가 없어요' : `오늘 복습 ${count}장`;
}

export const STUDY = {
  start: '학습하기',
  flipHint: '눌러서 정답 보기',
  forget: '기억 못 함',
  remember: '기억함',
  backToDeck: '덱으로 돌아가기',
  backHome: '홈으로',
  allTitle: '오늘 복습',
  allEmptyBody: '다음 복습일이 되면 홈에서 다시 학습할 수 있어요.',
  emptyTitle: '오늘 복습할 카드가 없어요',
  emptyBody: '다음 복습일이 되면 이 덱에서 다시 학습할 수 있어요.',
  doneTitle: '오늘 학습을 마쳤어요',
  quitTitle: '학습을 그만할까요?',
  quitDetail: '지금까지 판정한 카드는 저장됐어요.',
  quitConfirm: '그만하기',
};

// 진행 표시 "1 / 3"을 스크린리더가 읽을 문장
export function progressLabel(current: number, total: number): string {
  return `${total}장 중 ${current}번째`;
}

// 기억함 비율(%). 완료 0장이면 0
export function rememberedPercent(remembered: number, completed: number): number {
  return completed === 0 ? 0 : Math.round((remembered / completed) * 100);
}

// 하루 상한 때문에 빠진 카드 안내. 홈·덱 상세·학습 완료 화면이 같이 쓴다
export function overflowNotice(rest: number): string {
  return `오늘은 ${DAILY_LIMIT}장까지 학습해요. 나머지 ${rest}장은 내일 이어서 나와요.`;
}

// 기기 시계 되돌림 경고. lastOpenedDate는 'YYYY-MM-DD'
export function clockWarning(lastOpenedDate: string): string {
  const [, m, d] = lastOpenedDate.split('-').map(Number);
  return `기기 날짜가 마지막으로 앱을 연 날(${m}월 ${d}일)보다 이전이에요. 날짜 설정을 확인해 주세요.`;
}

export const HOME = {
  title: '오늘 복습',
  overdue: (n: number) => `연체 ${n}장`,
  noneTitle: '오늘 복습할 카드가 없어요',
  noneBody: '다음 복습일이 되면 여기에 다시 나와요.',
  firstTitle: '복습큐를 시작해 볼까요?',
  firstBody: '과목과 덱을 만들고 카드를 추가하면 복습할 날에 맞춰 여기에 모아 보여 줘요.',
  subjectsTitle: '과목별',
  start: '학습 시작',
  manage: '과목·덱 관리',
  create: '과목·덱 만들기',
};

export const STATS = {
  title: '통계',
  todayDone: '오늘 완료',
  totalCards: '전체 카드',
  stagesTitle: '단계별 카드',
  recentTitle: '최근 7일 학습',
  emptyTitle: '아직 통계가 없어요',
  emptyBody: '카드를 만들고 학습하면 여기에 통계가 쌓여요.',
  entry: '통계',
};

// 단계 라벨: 0은 새 카드·다시 학습, 1~6은 간격 일수
export function stageLabel(stage: number): string {
  return stage === 0 ? '새 카드·다시 학습' : `${INTERVALS[stage - 1]}일 간격`;
}

export const RECOVERY = {
  title: '저장된 데이터 일부를 읽을 수 없어요',
  body: (n: number) => `읽을 수 없는 항목 ${n}개는 원본을 따로 보관한 뒤 아래 방법으로 다시 열 수 있어요.`,
  backupTitle: (date: string) => `${formatMonthDay(date)} 백업`,
  backupBody: (subjects: number, decks: number, cards: number) => `과목 ${subjects}개 · 덱 ${decks}개 · 카드 ${cards}장`,
  restore: '백업으로 복구',
  drop: '손상 항목 빼고 열기',
  retry: '다시 시도',
  dropTitle: '손상 항목을 빼고 열까요?',
  dropDetail: (items: string[]) => `${items.join(', ')} 항목을 비운 채 열어요. 원본은 따로 보관돼요.`,
  dropConfirm: '빼고 열기',
  failed: '복구하지 못했어요. 저장된 데이터는 그대로예요. 잠시 후 다시 시도해 주세요.',
  readFailedTitle: '데이터를 불러오지 못했어요',
  readFailedBody: '저장된 데이터는 그대로예요. 잠시 후 다시 시도해 주세요.',
};

// 손상된 저장 키를 사용자에게 보일 이름으로 바꾼다
export function corruptItemLabel(key: string): string {
  if (key === 'bq:meta') return '앱 설정 정보';
  if (key === 'bq:subjects') return '과목 목록';
  if (key === 'bq:decks') return '덱 목록';
  if (key.startsWith('bq:cards:')) return '덱 하나의 카드 목록';
  if (key.startsWith('bq:logs:')) return `${Number(key.slice(-2))}월 학습 기록`;
  return '저장 항목';
}

function formatMonthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일`;
}

export const SAVE_ERROR = {
  body: '변경 내용을 저장하지 못했어요. 앱을 닫기 전에 다시 시도해 주세요.',
  retry: '다시 시도',
};

export const NOTIFY = {
  ask: '복습 알림 받기',
  agreed: '복습 알림을 받을 수 있어요.',
  failed: '알림 설정을 열지 못했어요. 잠시 후 다시 시도해 주세요.',
};
