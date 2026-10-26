import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from './memoryStorage';
import { createSaveQueue } from './saveQueue';

function spiedStorage() {
  const storage = createMemoryStorage();
  vi.spyOn(storage, 'setItems');
  vi.spyOn(storage, 'removeItem');
  return storage;
}

describe('saveQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('100ms 간격 연속 편집 3회는 마지막 편집 400ms 후 마지막 값으로 1회 저장한다', async () => {
    const storage = spiedStorage();
    const queue = createSaveQueue({ storage });

    queue.enqueue({ set: { 'bq:cards:A': [1] }, remove: [] });
    await vi.advanceTimersByTimeAsync(100);
    queue.enqueue({ set: { 'bq:cards:A': [1, 2] }, remove: [] });
    await vi.advanceTimersByTimeAsync(100);
    queue.enqueue({ set: { 'bq:cards:A': [1, 2, 3] }, remove: [] });

    await vi.advanceTimersByTimeAsync(399);
    expect(storage.setItems).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(storage.setItems).toHaveBeenCalledTimes(1);
    expect(storage.setItems).toHaveBeenCalledWith({ 'bq:cards:A': '[1,2,3]' });
  });

  it('flush는 지연을 기다리지 않고 즉시 저장한다', async () => {
    const storage = spiedStorage();
    const queue = createSaveQueue({ storage });

    queue.enqueue({ set: { 'bq:decks': [] }, remove: [] });
    await queue.flush();
    expect(storage.setItems).toHaveBeenCalledWith({ 'bq:decks': '[]' });

    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.setItems).toHaveBeenCalledTimes(1);
  });

  it('삭제 키는 removeItem으로 지운다', async () => {
    const storage = spiedStorage();
    await storage.setItems({ 'bq:cards:A': '[]' });
    vi.mocked(storage.setItems).mockClear();
    const queue = createSaveQueue({ storage });

    queue.enqueue({ set: {}, remove: ['bq:cards:A'] });
    await queue.flush();

    expect(storage.removeItem).toHaveBeenCalledWith('bq:cards:A');
    expect(storage.setItems).not.toHaveBeenCalled();
    expect((await storage.getItems(['bq:cards:A']))['bq:cards:A']).toBeNull();
  });

  it('저장 실패 후 다음 저장에서 실패분과 새 변경을 모두 최신 값으로 저장한다', async () => {
    const storage = spiedStorage();
    const onError = vi.fn();
    const queue = createSaveQueue({ storage, onError });

    vi.mocked(storage.setItems).mockRejectedValueOnce(new Error('UNKNOWN_ERROR'));
    queue.enqueue({ set: { 'bq:cards:A': ['a1'] }, remove: [] });
    await queue.flush();
    expect(onError).toHaveBeenCalledTimes(1);

    queue.enqueue({ set: { 'bq:cards:B': ['b1'] }, remove: [] });
    await vi.advanceTimersByTimeAsync(400);

    expect(storage.setItems).toHaveBeenLastCalledWith({ 'bq:cards:A': '["a1"]', 'bq:cards:B': '["b1"]' });
    expect(await storage.getItems(['bq:cards:A', 'bq:cards:B'])).toEqual({
      'bq:cards:A': '["a1"]',
      'bq:cards:B': '["b1"]',
    });
  });

  it('저장 중에 바뀐 키는 실패해도 이전 값으로 되돌리지 않는다', async () => {
    const storage = spiedStorage();
    let reject!: (e: Error) => void;
    vi.mocked(storage.setItems).mockImplementationOnce(() => new Promise((_, r) => (reject = r)));
    const queue = createSaveQueue({ storage, onError: () => {} });

    queue.enqueue({ set: { 'bq:cards:A': ['old'] }, remove: [] });
    const first = queue.flush();
    await vi.advanceTimersByTimeAsync(0);
    queue.enqueue({ set: { 'bq:cards:A': ['new'] }, remove: [] });
    reject(new Error('UNKNOWN_ERROR'));
    await first;

    await queue.flush();
    expect((await storage.getItems(['bq:cards:A']))['bq:cards:A']).toBe('["new"]');
  });
});
