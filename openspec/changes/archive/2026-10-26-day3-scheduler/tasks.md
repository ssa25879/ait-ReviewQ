# Tasks

모든 경로는 `reviewq/` 기준이다.

## 1. 날짜와 스케줄러

- [x] 1.1 `src/utils/date.ts`에 `addDays`·`isDue`를 추가하고 `date.test.ts`에 테스트를 더한다. 검증: 2026-01-31 + 30 → 2026-03-02(S-07), 2028-02-28 + 1 → 2028-02-29, 2028-02-29 + 1 → 2028-03-01, 2026-12-31 + 1 → 2027-01-01(S-08), `isDue` 경계 테스트가 통과한다
- [x] 1.2 `src/domain/scheduler/fixedInterval.ts`(`INTERVALS`, `fixedIntervalScheduler`)를 구현하고 `fixedInterval.test.ts`를 작성한다. 검증: S-01~S-06, S-10과 "같은 날이면 같은 참조 반환", 공통 갱신(직전 복습일·복습 횟수·알고리즘) 테스트가 통과한다

## 2. 큐와 판정 반영

- [x] 2.1 `src/domain/queue.ts`의 `buildQueue`를 구현하고 테스트한다. 검증: 연체 포함(S-05), 미래 제외(S-10), 예정일·생성 순 정렬, 130장 → 100장 + overflow 30, 덱 하나 범위 테스트가 통과한다
- [x] 2.2 `ContentState`에 `logs`를 추가하고 `card/review` 액션(스케줄러 호출, 일정이 바뀐 경우만 해당 덱 카드·해당 월 로그 갱신)과 `actions.reviewCard` 생성 함수를 구현한다. 기존 `emptyContent`·테스트 픽스처를 맞춘다. 검증: 판정 → 일정 갱신·로그 1건(날짜·이전/새 단계), 같은 날 재판정 → 상태 참조 그대로·로그 1건 유지, 다른 덱 카드 배열·다른 달 로그 참조 유지 테스트가 통과한다

## 3. 세션 진행

- [x] 3.1 `src/domain/session.ts`(`startSession`·`flip`·`judge`·`progress`·`summarize`)를 구현하고 테스트한다. 검증: 뒤집기 전 판정 무시, 첫 판정만 `apply` 반환, 기억 못 함 1회 재출제·재출제 판정은 `apply` 없음·두 번째 실패에도 추가 재출제 없음, 진행 2/3, 자정 경과에도 세션 날짜로 `apply`(S-09), 요약(완료·기억함·내일 예정) 테스트가 통과한다

## 4. 저장

- [x] 4.1 `loadContent(storage, today)`가 이번 달·지난달 로그를 읽고 `diffContent`가 바뀐 로그 월 키만 저장하도록 확장하고 테스트를 더한다. `bootstrap`에서 오늘 날짜를 넘긴다. 검증: 2027-01-05 → `bq:logs:2027-01`·`bq:logs:2026-12` 조회, 손상된 로그 키는 오류·값 유지, 판정 1건 → `bq:logs:2026-10`만 저장 테스트가 통과한다
- [x] 4.2 Provider에서 `card/review` 디스패치 후 변경 키를 넣고 즉시 `flush()`하도록 한다. `persistence.test.ts`에 판정 → 즉시 저장 → 재로드 시 일정·로그 유지 테스트를 추가한다. 검증: `npx tsc -b`·`npm run lint`·`npm test -- --run`이 통과하고, 저장 지연(400ms) 전에 저장소에 판정 결과가 있는 테스트가 통과한다
- [x] 4.3 통합 확인: `npm run build` 성공, devtools dev 서버에서 기존 day2 CDP 스크립트(48항목)가 그대로 통과해 회귀가 없는지 확인한다

## Workflow follow-up

- 다음 change `day3-study-session`(세션·완료 화면, 덱 상세의 "이 덱 학습" 진입, 판정 버튼 잠금, 세션 중 뒤로가기 확인)을 이 change를 archive한 뒤 만든다.
- 리뷰 후 커밋·푸시하고 change를 archive한다.
