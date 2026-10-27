import { describe, expect, it } from 'vitest';
import { buildQueue } from '../domain/queue';
import { recentDailyCounts } from '../domain/stats';
import { parseImport } from '../infra/storage/importData';
import { addDays } from '../utils/date';
import { buildDemoDoc } from './demoData';

const today = '2026-10-27';
let n = 0;
const newId = () => `id-${++n}`;

describe('buildDemoDoc', () => {
  const doc = buildDemoDoc(today, newId, new Date('2026-10-27T03:00:00.000Z'));
  const content = { subjects: doc.subjects, decks: doc.decks, cards: doc.cards, logs: doc.logs };
  const cards = Object.values(doc.cards).flat();

  it('가져오기 검사를 통과하고 과목 3개 이상', () => {
    expect(parseImport(JSON.stringify(doc)).ok).toBe(true);
    expect(doc.subjects.length).toBeGreaterThanOrEqual(3);
  });

  it('오늘 복습 카드와 다음 복습일이 미래인 카드가 있다', () => {
    expect(buildQueue(content, today).cards.length).toBeGreaterThan(0);
    expect(cards.some((c) => c.schedule.dueDate > today)).toBe(true);
    expect(new Set(cards.map((c) => c.schedule.stage)).size).toBeGreaterThanOrEqual(3);
  });

  it('최근 7일 안에 학습 기록이 있다', () => {
    const days = recentDailyCounts(content, today);
    expect(days.some((d) => d.count > 0)).toBe(true);
    expect(Object.values(doc.logs).flat().every((l) => l.date >= addDays(today, -7) && l.date <= today)).toBe(true);
  });
});
