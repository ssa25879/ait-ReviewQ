# Design

## Context

- Day 1 결과(`openspec/specs/data-storage`): `StorageAdapter`(getItems / setItems / removeItem / clearItems), SDK 어댑터 `createAitStorage(Storage)`, 메모리 어댑터, `bq:*` 키 함수(`SUBJECTS_KEY`·`DECKS_KEY`·`cardsKey`), `initMeta`, `newId`, `todayLocal`, Vitest가 있다.
- `src/App.tsx`는 모듈 수준에서 `initMeta`를 1회 실행하고 개발 모드에서 결과를 로그로 남긴다. 화면은 스타터 그대로다.
- 상태 관리는 기획서 8.1에 따라 React Context + useReducer, 외부 라이브러리 없음. React 컴포넌트 테스트 도구(testing-library, jsdom)는 없다.
- 키 분할(기획서 7.3): 과목·덱은 단일 키, 카드는 덱 단위 키. 저장 정책(7.4): 변경 키만 디바운스 후 `setItems`.

## Goals / Non-Goals

**Goals:**
- CRUD·연쇄 삭제·변경 키 계산·저장 큐를 React와 분리된 순수 모듈로 두어 Node 단위 테스트로 검증한다.
- Provider는 이 모듈들을 연결만 하는 얇은 층으로 둔다.

**Non-Goals:**
- 화면·라우팅, 재시도 횟수·백오프·실패 안내 UI, 저장 데이터 형식 검증, 고아 카드 키(덱 목록에 없는 `bq:cards:*`) 정리.

## Decisions

1. **상태 형태를 저장 키 구조와 맞춘다.** `ContentState = { subjects: Subject[]; decks: Deck[]; cards: Record<deckId, Card[]> }`. 리듀서는 바뀌지 않은 배열의 참조를 유지한다. 그러면 변경 키는 참조 비교만으로 계산된다(`prev.subjects !== next.subjects` → `bq:subjects`, `prev.cards[id] !== next.cards[id]` → `bq:cards:{id}`, `next`에 없는 덱 id → 삭제 키).
   - 대안: 액션마다 변경 키를 직접 표시 → 기각(액션 추가 시 누락 위험, 리듀서가 저장 세부를 알게 됨).
2. **리듀서는 순수하게, id·시각·오늘 날짜는 액션 payload로 받는다.** `actions.ts`의 액션 생성 함수가 `newId()`·`new Date().toISOString()`·`todayLocal()`을 채운다. 테스트는 payload를 직접 만들어 결정적으로 검증한다.
3. **검증은 `domain/validation.ts`의 순수 함수로 두고, 리듀서도 같은 함수로 다시 검사한다.** 화면은 디스패치 전에 검증 결과로 안내 문구를 고른다. 리듀서는 위반 액션이나 존재하지 않는 대상(과목·덱·카드 id)을 받으면 상태를 그대로 돌려준다(no-op). 결과 타입은 `{ ok: true; value: string } | { ok: false; reason: 'empty' | 'tooLong' }`. 글자 수는 `[...s].length`(코드 포인트)로 센다.
4. **신규 카드 일정의 알고리즘 id·버전은 `domain/scheduler/constants.ts`의 상수로 둔다**(`'fixed-interval'`, 1). Day 3 스케줄러가 같은 상수를 쓴다.
5. **저장 큐(`infra/storage/saveQueue.ts`)는 키별 대기 값을 보관한다.** 대기 맵은 `key → 값 | REMOVE`이고, 같은 키는 마지막 값으로 덮인다. 직렬화(`JSON.stringify`)는 저장 시점에 한 번만 한다(연속 편집 중 큰 카드 배열을 반복 직렬화하지 않기 위해). 저장은 한 번에 하나만 실행하며, 실행 중 들어온 변경은 다음 주기로 넘긴다. 실패하면 그 사이 새 값으로 덮이지 않은 항목만 대기 맵에 되돌리고 오류를 `console.error`로 남긴다. 타이머는 주입 가능하게 해 Vitest 가짜 타이머로 테스트한다.
   - `flush()`는 대기 중인 타이머를 취소하고 즉시 저장한다. 실행 중인 저장이 있으면 끝난 뒤 실행한다.
6. **로드(`infra/storage/loadContent.ts`)는 두 번 조회한다.** `getItems([bq:subjects, bq:decks])`로 덱 목록을 얻은 뒤 `getItems(덱별 카드 키)`. 값이 없으면 빈 배열, JSON 파싱 실패 시 해당 키를 담은 오류를 던진다(덮어쓰지 않음, Day 1 Meta와 같은 원칙). 형식 검증은 Day 5.
7. **부트스트랩을 Provider로 옮긴다.** `app/bootstrap.ts`가 SDK 어댑터로 `initMeta` → `loadContent`를 모듈 수준 Promise로 1회 실행한다(StrictMode 이중 effect 대응, Day 1 결정 유지). `App.tsx`의 Meta 초기화 코드는 여기로 이동한다. Provider(`app/store.tsx`)는 상태 `status: 'loading' | 'ready' | 'error'`를 갖고, `ready` 이후 상태가 바뀔 때마다 직전 상태와 비교해 저장 큐에 넣는다. 로드 실패 시에는 저장하지 않는다(손상 데이터 덮어쓰기 방지). 컨텍스트 객체와 `useContent` 훅은 `app/contentContext.ts`로 분리한다(oxlint `only-export-components`).
8. **`visibilitychange`가 `hidden`이 되면 `flush()`한다.** Provider effect에서 등록·해제한다. `pagehide`는 추가하지 않는다(실기기 동작 확인 전, 기획서 7.4 [검증 필요]).
9. **연쇄 삭제는 리듀서 안에서 한 번의 상태 전이로 처리한다.** 과목 삭제 시 해당 과목의 덱 id를 모아 `decks`와 `cards`에서 함께 제거한다. 리뷰 로그(`bq:logs:*`)는 지우지 않는다. 로그는 통계 근거이며 Day 2에는 아직 기록하지 않는다.

## Risks / Trade-offs

- [Provider·visibilitychange 연결은 단위 테스트가 없다] → 로직을 순수 모듈에 두고, 로드→리듀서→변경 키→큐→메모리 저장소→재로드 왕복을 통합 단위 테스트로 검증한다. Provider 연결은 tsc·lint와 devtools 실행(부트 로그)으로 확인하고, 실제 편집 영속성은 day2-crud-screens에서 화면으로 확인한다.
- [저장 실패가 계속되면 사용자에게 알리지 않는다] → 콘솔 오류만 남기고 다음 변경 때 재저장한다. 안내 UI·재시도 제한은 Day 5.
- [백그라운드 전환 직후 앱이 종료되면 비동기 저장이 끝나지 않을 수 있다] → 실기기 확인은 Day 6 체크리스트로 넘긴다.
- [덱 이동 시 카드 키는 덱 id 기준이라 바뀌지 않는다] → 이동은 `bq:decks`만 저장한다. 의도된 동작이다.

## Open Questions

- 실기기에서 `visibilitychange`가 토스 앱 전환·종료 시 발생하는지(기획서 7.4 [검증 필요]). Day 6에서 확인하며 이번 설계는 바뀌지 않는다.
