# Tasks

모든 경로는 `reviewq/` 기준이다.

## 1. 도메인 규칙

- [x] 1.1 `src/domain/validation.ts`에 이름(1~30자)·카드 텍스트(1~500자) 검증 함수를 구현하고 `validation.test.ts`를 작성한다. 검증: 공백만 입력 → empty, 앞뒤 공백 제거 후 30자 통과, 31자 → tooLong, 줄바꿈 유지, 이모지 500개 통과 테스트가 통과한다
- [x] 1.2 `src/domain/scheduler/constants.ts`에 알고리즘 id·버전 상수를 두고, `src/domain/content.ts`에 `ContentState`·액션 타입·리듀서를 구현한다(과목·덱·카드 생성·수정·덱 이동·삭제, 연쇄 삭제, 신규 카드 초기 일정, 위반·없는 대상은 no-op, 바뀌지 않은 배열 참조 유지). `content.test.ts`를 작성한다. 검증: study-content 스펙의 모든 시나리오와 "수정하지 않은 덱의 카드 배열 참조가 유지된다" 테스트가 통과한다
- [x] 1.3 `src/app/actions.ts`에 id·시각·오늘 날짜를 채우는 액션 생성 함수를 구현한다. 검증: `npx tsc -b`가 통과하고, 생성 함수가 만든 카드 생성 액션을 리듀서에 넣으면 오늘 날짜의 신규 일정이 붙는 테스트가 통과한다

## 2. 저장 계층

- [x] 2.1 `src/infra/storage/loadContent.ts`를 구현하고 테스트한다. 검증: 빈 저장소 → 빈 상태, 저장된 과목·덱·덱별 카드 로드, 카드 키가 없는 덱은 빈 배열, 손상된 카드 키는 오류를 던지고 저장 값이 그대로인 테스트가 통과한다
- [x] 2.2 `src/infra/storage/diffContent.ts`에 이전·다음 상태의 변경 키(저장할 키와 값, 삭제할 키) 계산을 구현하고 테스트한다. 검증: 덱 A 카드 수정 → `bq:cards:A`만, 덱 이동 → `bq:decks`만, 과목 연쇄 삭제 → `bq:subjects`·`bq:decks` 저장과 해당 덱 카드 키 삭제가 나오는 테스트가 통과한다
- [x] 2.3 `src/infra/storage/saveQueue.ts`(400ms 디바운스, 키별 마지막 값, 저장 시점 직렬화, 단일 실행, 실패 시 보존, `flush()`)를 구현하고 가짜 타이머로 테스트한다. 검증: 연속 편집 3회 → 1회 저장·마지막 값, flush 즉시 저장, 삭제 키는 `removeItem`, 실패 후 다음 저장에서 실패분과 새 변경이 모두 최신 값으로 저장되는 테스트가 통과한다
- [x] 2.4 통합 단위 테스트: 메모리 저장소에서 로드 → 리듀서로 과목·덱·카드 생성과 과목 연쇄 삭제 → 변경 키 → 저장 큐 flush → 다시 로드한 상태가 직전 상태와 같은지 검증한다. 검증: 테스트가 통과하고 삭제된 덱의 카드 키가 `null`이다

## 3. 앱 연결

- [x] 3.1 `src/app/bootstrap.ts`(initMeta → loadContent, 모듈 수준 1회), `src/app/contentContext.ts`(컨텍스트·`useContent`), `src/app/store.tsx`(Provider: 상태·로드 상태, 변경 시 저장 큐, `visibilitychange` hidden → flush, 로드 실패 시 저장 안 함)를 구현한다. `App.tsx`의 Meta 초기화 코드를 bootstrap으로 옮기고 `main.tsx`에서 Provider로 감싼다. 개발 모드에서만 로드 결과(과목·덱·카드 수, installId)를 `console.info`로 남긴다. 검증: `npx tsc -b`·`npm run lint`·`npm test -- --run`이 통과한다
- [x] 3.2 통합 확인: `npm run dev`로 devtools에서 열어 콘솔에 로드 결과가 오류 없이 출력되는지, 스타터 화면이 그대로인지 확인한다. 이어서 `npm run build`가 성공하는지 확인한다

## Workflow follow-up

- 실제 편집 후 재실행 영속성은 day2-crud-screens에서 화면으로 확인한다.
- 실기기 `visibilitychange` 동작은 Day 6 체크리스트로 넘긴다.
- 리뷰 후 커밋하고 change를 archive한다.
