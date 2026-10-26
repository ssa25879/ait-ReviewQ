# Tasks

모든 경로는 `reviewq/` 기준이다.

## 1. 테스트 환경

- [x] 1.1 devDependency `vitest`를 설치하고 `package.json`에 `"test": "vitest"` 스크립트를 추가한다. 검증: 빈 상태에서 `npx vitest run --passWithNoTests`가 exit 0으로 끝난다(devtools unplugin과 충돌하면 design 결정 7에 따라 `vitest.config.ts`로 분리한다)

## 2. 도메인 타입과 유틸

- [x] 2.1 `src/domain/scheduler/types.ts`에 Grade·CardSchedule·Scheduler를 정의하고, `src/domain/model.ts`에 Subject·Deck·Card·ReviewLog·Meta를 정의한다. `CardSchedule`은 scheduler/types에서 import한다. 검증: `npx tsc -b`가 오류 없이 통과한다
- [x] 2.2 `src/utils/id.ts`의 `newId()`와 `src/utils/date.ts`의 `todayLocal()`을 구현하고 `id.test.ts`·`date.test.ts`를 작성한다. 검증: 연속 생성 시 서로 다른 id, `crypto.randomUUID` 미지원 시 대체 id, `todayLocal(new Date(2026, 0, 5))` → `2026-01-05`가 모두 통과한다

## 3. 저장소 계층

- [x] 3.1 `src/infra/storage/keys.ts`에 `bq:*` 키 생성 함수를 구현하고 `keys.test.ts`를 작성한다. 검증: `bq:cards:d1`, 날짜 `2026-10-26` → `bq:logs:2026-10` 등 스펙의 키 체계 시나리오가 통과한다
- [x] 3.2 `src/infra/storage/StorageAdapter.ts` 인터페이스와 `memoryStorage.ts`(Map 기반)를 구현하고 어댑터 계약 테스트를 작성한다. 검증: 일부 키만 있을 때 `null` 포함 조회, 저장 후 재조회, 단일 삭제, 전체 삭제 시나리오가 통과한다
- [x] 3.3 `src/infra/storage/aitStorage.ts`에 SDK `Storage`를 주입받는 어댑터를 구현한다. `getItems`·`setItems.isSupported()`가 false면 단건 API로 대체한다. 가짜 Storage 객체로 테스트한다. 검증: 일괄 지원·미지원 두 경로의 조회·저장 결과가 같고, 쓰기 오류가 호출자에게 전파되는 테스트가 통과한다
- [x] 3.4 `src/infra/storage/meta.ts`에 Meta 초기화 함수(어댑터·오늘·id 생성기 주입)를 구현하고 테스트한다. 검증: 빈 저장소에서 schemaVersion 1·오늘 날짜·installId 저장, 재실행 시 같은 installId 유지, 손상된 JSON이면 덮어쓰지 않고 오류를 던지는 테스트가 통과한다

## 4. 앱 연결과 통합 확인

- [x] 4.1 `src/App.tsx`에서 SDK 어댑터로 Meta 초기화를 모듈 수준 1회만 실행하고, 개발 모드에서만 결과를 `console.info`로 남긴다(스타터 화면 유지). 검증: `npx tsc -b`와 `npm run lint`가 통과한다
- [x] 4.2 통합 확인: `npm run dev`로 브라우저(devtools)에서 열어 콘솔의 installId를 확인하고, 새로고침 후 같은 installId가 출력되는지 확인한다. 이어서 `npm test -- --run` 전체 통과와 `npm run build`(`.ait` 생성)를 확인한다

## Workflow follow-up

- 실기기에서의 Storage 왕복과 `crypto.randomUUID` 지원 여부 확인은 Day 6 실기기 검증 체크리스트로 넘긴다.
- 리뷰 후 커밋하고 change를 archive한다.
