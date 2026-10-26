import { describe, expect, it, vi } from 'vitest';
import { createAitStorage, type SdkStorage } from './aitStorage';
import { describeStorageContract } from './storageContract';

// Map 기반 가짜 SDK Storage. batch가 false면 getItems·setItems 미지원 버전을 흉내 낸다
function createFakeSdk(batch: boolean) {
  const map = new Map<string, string>();
  const getItems = Object.assign(
    vi.fn(async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, map.get(k) ?? null]))),
    { isSupported: () => batch },
  );
  const setItems = Object.assign(
    vi.fn(async (items: Record<string, string>) => {
      for (const [k, v] of Object.entries(items)) map.set(k, v);
    }),
    { isSupported: () => batch },
  );
  const sdk = {
    getItem: vi.fn(async (key: string) => map.get(key) ?? null),
    getItems,
    setItem: vi.fn(async (key: string, value: string) => {
      map.set(key, value);
    }),
    setItems,
    removeItem: vi.fn(async (key: string) => {
      map.delete(key);
    }),
    clearItems: vi.fn(async () => {
      map.clear();
    }),
  } satisfies SdkStorage;
  return sdk;
}

describeStorageContract('aitStorage(일괄 API 지원)', () => createAitStorage(createFakeSdk(true)));
describeStorageContract('aitStorage(일괄 API 미지원)', () => createAitStorage(createFakeSdk(false)));

describe('aitStorage 경로 선택', () => {
  it('일괄 API를 지원하면 getItems·setItems를 쓴다', async () => {
    const sdk = createFakeSdk(true);
    const storage = createAitStorage(sdk);
    await storage.setItems({ 'bq:subjects': '[]', 'bq:decks': '[]' });
    await storage.getItems(['bq:subjects', 'bq:decks']);
    expect(sdk.setItems).toHaveBeenCalledTimes(1);
    expect(sdk.getItems).toHaveBeenCalledTimes(1);
    expect(sdk.setItem).not.toHaveBeenCalled();
    expect(sdk.getItem).not.toHaveBeenCalled();
  });

  it('일괄 API를 지원하지 않으면 키별 단건 API로 대체한다', async () => {
    const sdk = createFakeSdk(false);
    const storage = createAitStorage(sdk);
    await storage.setItems({ 'bq:subjects': '[]', 'bq:decks': '[]' });
    await storage.getItems(['bq:subjects', 'bq:decks']);
    expect(sdk.setItem).toHaveBeenCalledTimes(2);
    expect(sdk.getItem).toHaveBeenCalledTimes(2);
    expect(sdk.setItems).not.toHaveBeenCalled();
    expect(sdk.getItems).not.toHaveBeenCalled();
  });

  it('일괄 조회 결과에 빠진 키는 null로 채운다', async () => {
    const sdk = createFakeSdk(true);
    sdk.getItems.mockResolvedValueOnce({ 'bq:meta': '{}' });
    const storage = createAitStorage(sdk);
    expect(await storage.getItems(['bq:meta', 'bq:subjects'])).toEqual({
      'bq:meta': '{}',
      'bq:subjects': null,
    });
  });
});

describe('aitStorage 쓰기 오류', () => {
  it('일괄 저장 오류를 호출자에게 전파한다', async () => {
    const sdk = createFakeSdk(true);
    sdk.setItems.mockRejectedValueOnce(new Error('UNKNOWN_ERROR'));
    await expect(createAitStorage(sdk).setItems({ 'bq:meta': '{}' })).rejects.toThrow('UNKNOWN_ERROR');
  });

  it('단건 대체 저장 중 하나라도 실패하면 오류를 전파한다', async () => {
    const sdk = createFakeSdk(false);
    sdk.setItem.mockRejectedValueOnce(new Error('UNKNOWN_ERROR'));
    await expect(
      createAitStorage(sdk).setItems({ 'bq:subjects': '[]', 'bq:decks': '[]' }),
    ).rejects.toThrow('UNKNOWN_ERROR');
  });
});
