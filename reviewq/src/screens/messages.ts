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
  sample: '예시 카드로 둘러보기',
  sampleHint: '예시 과목은 과목·덱 관리에서 지울 수 있어요.',
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
  // 설정의 '복습 알림' 항목
  settingsTitle: '복습 알림',
  stateAgreed: '복습 알림을 받고 있어요',
  stateRejected: '복습 알림을 받지 않고 있어요',
  stateUnset: '아직 정하지 않았어요',
  settingsAsk: '알림 받기',
  offHint: '알림을 끄려면 토스 앱 설정에서 바꿀 수 있어요.',
};

// help·reason.noSeparator의 따옴표 안 " / " 공백은 줄바꿈 없는 공백(U+00A0)이다(구분자 표시가 두 줄로 갈라지지 않게)
export const BULK = {
  entry: '여러 장 한 번에 추가',
  title: '여러 장 한 번에 추가',
  help: '한 줄에 카드 한 장씩, 질문과 정답 사이에 " / " 또는 "|"를 넣어 주세요. 스프레드시트에서 두 칸을 복사해 붙여넣어도 돼요.',
  example: 'apple / 사과\nbanana | 바나나',
  inputLabel: '카드 목록',
  ready: (n: number) => `${n}장 추가 예정`,
  errorCount: (n: number) => `오류 ${n}줄`,
  more: (n: number) => `외 ${n}줄`,
  tooMany: (max: number) => `한 번에 ${max}줄까지 추가할 수 있어요. 나눠서 붙여넣어 주세요.`,
  add: (n: number) => (n > 0 ? `${n}장 추가` : '추가'),
  added: (n: number) => `${n}장을 추가했어요. 오류가 있는 줄만 남겨 두었어요.`,
  reason: {
    noSeparator: '질문과 정답 사이에 " / " 또는 "|"가 없어요',
    emptyQuestion: '질문이 비어 있어요',
    emptyAnswer: '정답이 비어 있어요',
    tooLong: '질문과 정답은 500자 이하로 입력해 주세요',
  },
  lineLabel: (line: number) => `${line}번째 줄`,
};

export const SETTINGS = {
  entry: '설정',
  title: '설정',
  storageTitle: '데이터는 이 기기에만 저장돼요',
  storageBody: '토스 앱을 지우거나 기기를 바꾸면 학습 데이터가 사라져요. 가끔 백업을 내보내 보관해 두세요.',
  backupTitle: '백업',
  dataTitle: '데이터',
  clear: '모든 데이터 삭제',
  clearConfirmTitle: '모든 데이터를 지울까요?',
  clearConfirmBody: '과목·덱·카드와 학습 기록, 알림 설정 기록이 모두 지워지고 되돌릴 수 없어요. 먼저 백업을 내보내 두세요.',
  clearContinue: '계속',
  clearFinalTitle: '정말 지울까요?',
  clearFinalBody: '지운 데이터는 다시 볼 수 없어요.',
  clearFinalConfirm: '삭제',
  clearing: '지우는 중이에요',
  clearFailed: '데이터를 지우지 못했어요. 다시 시도해 주세요.',
  retry: '다시 시도',
};

export const EXPORT = {
  description: '과목·덱·카드와 학습 기록을 JSON 파일 하나로 저장해요.',
  action: '백업 내보내기',
  working: '내보내는 중이에요',
  saved: (fileName: string) => `백업 파일(${fileName})을 저장했어요.`,
  saveFailed: '파일로 저장하지 못했어요. 아래 내용을 복사해 보관해 주세요.',
  unsupported: '이 기기에서는 파일로 저장할 수 없어요. 아래 내용을 복사해 보관해 주세요.',
  copyHint: '길게 눌러 전체 선택한 뒤 복사해 주세요.',
  textLabel: '백업 내용',
  failed: '백업을 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
};

export const IMPORT = {
  action: '백업 가져오기',
  description: '내보낸 백업 파일을 고르거나, 파일을 고를 수 없으면 백업 내용을 붙여넣어 주세요.',
  pickFile: '파일 선택',
  pasteLabel: '또는 백업 내용 붙여넣기',
  load: '불러오기',
  reading: '읽는 중이에요',
  notJson: '백업 파일이 아니에요. 내보내기로 저장한 파일인지 확인해 주세요.',
  invalid: '백업 파일 형식이 맞지 않아요. 내보내기로 저장한 파일인지 확인해 주세요.',
  inconsistent: '백업 내용이 서로 맞지 않아 가져올 수 없어요.',
  newer: '더 새로운 버전의 앱에서 만든 백업이에요. 앱을 업데이트한 뒤 가져와 주세요.',
  readFailed: '파일을 읽지 못했어요. 백업 내용을 붙여넣어 주세요.',
  summary: (s: { subjects: number; decks: number; cards: number; logs: number }) =>
    `과목 ${s.subjects}개, 덱 ${s.decks}개, 카드 ${s.cards}장, 학습 기록 ${s.logs}건`,
  exportedAt: (date: string) => `${date}에 내보낸 백업이에요.`,
  replace: '이 백업으로 바꾸기',
  confirmTitle: '지금 데이터를 바꿀까요?',
  confirmBody: '지금의 과목·덱·카드와 학습 기록이 백업 내용으로 바뀌어요. 알림 설정은 그대로예요.',
  confirmContinue: '계속',
  finalTitle: '정말 바꿀까요?',
  finalBody: '바꾸기 전 데이터는 이 기기에 따로 보관돼요.',
  finalConfirm: '바꾸기',
  replacing: '바꾸는 중이에요',
  failed: '백업을 가져오지 못했어요. 다시 시도해 주세요.',
};
