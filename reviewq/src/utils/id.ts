export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 대체 생성기: 충돌 가능성은 낮지만 0은 아니다
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
