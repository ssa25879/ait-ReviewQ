# Proposal

## Why

기획서 11장 Day 1의 완료 조건은 "devtools에서 빈 앱이 뜨고 Storage 읽기·쓰기가 왕복된다"이다. 스캐폴딩·설정·devtools는 끝났지만, 이후 CRUD(Day 2)·스케줄러(Day 3)가 딛고 설 도메인 타입과 저장소 계층이 아직 없다. 지금 이 기반을 고정해 두어야 이후 기능이 같은 모델과 같은 저장 경로를 공유한다.

## What Changes

- `src/domain/model.ts`: Subject, Deck, Card, ReviewLog, Meta 타입 정의(기획서 7.1).
- `src/domain/scheduler/types.ts`: Grade, CardSchedule, Scheduler 타입 정의(기획서 6.5). 타입만 두고 스케줄러 구현은 Day 3 변경으로 미룬다.
- `src/utils/id.ts`: `crypto.randomUUID` 우선, 미지원 시 대체 생성기를 쓰는 `newId()`.
- `src/utils/date.ts`: 로컬 날짜 `YYYY-MM-DD`를 돌려주는 `todayLocal()`.
- `src/infra/storage/`:
  - `StorageAdapter` 인터페이스(getItems / setItems / removeItem / clearItems).
  - 앱인토스 `Storage` 기반 어댑터. `getItems`·`setItems`를 지원하지 않는 토스 앱 버전(5.270.0 미만)에서는 단건 API로 대체한다.
  - 단위 테스트용 메모리 어댑터.
  - `bq:*` 키 생성 함수(기획서 7.3).
  - 앱 시작 시 `bq:meta`를 읽고, 없으면 새 Meta를 만들어 저장하는 초기화 함수.
- 앱 시작 시 Meta 초기화를 한 번 실행한다. 개발 모드에서는 결과를 콘솔에 남겨, 새로고침 후에도 같은 `installId`가 나오는지로 왕복을 확인한다.
- Vitest와 `test` 스크립트를 추가하고 키·어댑터·Meta 초기화를 단위 테스트한다.

범위 밖: 디바운스 저장 큐·flush·재시도(Day 2·5), 로드 형식 검증·마이그레이션·백업 복구(Day 5), 날짜 덧셈·스케줄러 구현(Day 3), 화면 구현, 입력 제한 검증. 기획서 7.8의 브라우저용 localStorage 어댑터는 만들지 않는다. devtools의 Storage mock이 이미 브라우저 localStorage에 저장하기 때문이다(design.md 참고).

## Capabilities

### New Capabilities
- `data-storage`: 기기 로컬 저장소 접근 추상화, `bq:*` 키 체계, 앱 메타데이터(Meta) 초기화와 영속.

### Modified Capabilities
(없음)

## Impact

- 코드: `reviewq/src/domain/`, `reviewq/src/utils/`, `reviewq/src/infra/storage/`를 새로 만들고 `reviewq/src/App.tsx`에 초기화 호출을 추가한다.
- 의존성: devDependency `vitest`를 추가하고 `package.json`에 `test` 스크립트를 추가한다.
- 외부 API: `@apps-in-toss/web-framework`의 `Storage`(getItem / getItems / setItem / setItems / removeItem / clearItems).
- 사용자에게 보이는 화면 변화는 없다(스타터 화면 유지).
