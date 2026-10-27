import type { Card, Deck, Meta, ReviewLog, Subject } from '../../domain/model';
import { INTERVALS } from '../../domain/scheduler/fixedInterval';
import { validateCardText, validateName } from '../../domain/validation';

// 저장소에서 읽은 값이 앱이 다루는 형식인지 검사한다. 외부 검증 라이브러리는 쓰지 않는다(기획서 7.5)

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTimestamp = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isStage = (v: unknown): v is number => isCount(v) && (v as number) <= INTERVALS.length;
const isName = (v: unknown) => typeof v === 'string' && validateName(v).ok;
const isCardText = (v: unknown) => typeof v === 'string' && validateCardText(v).ok;

export function isSubject(v: unknown): v is Subject {
  return isRecord(v) && isId(v.id) && isName(v.name) && isTimestamp(v.createdAt) && isTimestamp(v.updatedAt);
}

export function isDeck(v: unknown): v is Deck {
  return isSubject(v) && isId((v as unknown as Rec).subjectId);
}

function isSchedule(v: unknown): boolean {
  return (
    isRecord(v) &&
    isStage(v.stage) &&
    isDate(v.dueDate) &&
    (v.lastReviewedDate === null || isDate(v.lastReviewedDate)) &&
    isCount(v.reviewCount) &&
    isCount(v.lapseCount) &&
    isId(v.algorithmId) &&
    isCount(v.algorithmVersion)
  );
}

export function isCard(v: unknown): v is Card {
  return (
    isRecord(v) &&
    isId(v.id) &&
    isId(v.deckId) &&
    isCardText(v.question) &&
    isCardText(v.answer) &&
    isTimestamp(v.createdAt) &&
    isTimestamp(v.updatedAt) &&
    isSchedule(v.schedule)
  );
}

export function isReviewLog(v: unknown): v is ReviewLog {
  return (
    isRecord(v) &&
    isId(v.id) &&
    isId(v.cardId) &&
    isDate(v.date) &&
    (v.grade === 'remember' || v.grade === 'forget') &&
    isStage(v.prevStage) &&
    isStage(v.nextStage) &&
    isTimestamp(v.reviewedAt)
  );
}

export function isMeta(v: unknown): v is Meta {
  return isRecord(v) && isCount(v.schemaVersion) && v.schemaVersion >= 1 && isDate(v.lastOpenedDate) && isId(v.installId);
}

export type Parsed<T> = { ok: true; value: T } | { ok: false };

// 키 값(JSON 문자열)을 읽어 형식을 검사한다. JSON이 아니거나 형식이 틀리면 ok: false
export function parseValid<T>(raw: string, isValue: (v: unknown) => v is T): Parsed<T> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  return isValue(value) ? { ok: true, value } : { ok: false };
}

// 목록 키: 값이 없으면 빈 목록, 목록이 아니거나 항목 하나라도 틀리면 ok: false
export function parseValidList<T>(raw: string | null, isItem: (v: unknown) => v is T): Parsed<T[]> {
  if (raw == null) return { ok: true, value: [] };
  return parseValid(raw, (v): v is T[] => Array.isArray(v) && v.every(isItem));
}
