import { describe, expect, it } from 'vitest';
import { BACKUP_KEY, DECKS_KEY, META_KEY, SUBJECTS_KEY, cardsKey, logsKey } from './keys';

describe('저장 키 체계', () => {
  it('단일 키는 bq: 접두사를 쓴다', () => {
    expect(META_KEY).toBe('bq:meta');
    expect(SUBJECTS_KEY).toBe('bq:subjects');
    expect(DECKS_KEY).toBe('bq:decks');
    expect(BACKUP_KEY).toBe('bq:backup:last');
  });

  it('덱별 카드 키', () => {
    expect(cardsKey('d1')).toBe('bq:cards:d1');
  });

  it('월별 로그 키', () => {
    expect(logsKey('2026-10-26')).toBe('bq:logs:2026-10');
  });
});
