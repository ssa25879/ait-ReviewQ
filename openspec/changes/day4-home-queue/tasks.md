# Tasks

모든 경로는 `reviewq/` 기준이다. 화면 동작 검증은 scratchpad의 CDP 스크립트(devtools dev 서버 5199, 헤드리스 Edge — Node에서 실행할 때 출력 폴더는 절대 경로)로 한다.

## 1. 경로 재배치

- [ ] 1.1 `src/app/router.ts`에 `home`(`#/`)·`subjects`(`#/subjects`)·`studyAll`(`#/study`)을 두고 `parseRoute`(알 수 없는 해시 → home)·`formatRoute`·`seedRoutes`(design 결정 1)·`routeTargetExists`를 맞춘다. `App.tsx`의 없는 대상 대체를 `home`으로 바꾸고, 기존 `navigate({ name: 'subjects' })` 호출처를 점검한다. 검증: `router.test.ts`에 새 경로 왕복, seed 체인, 알 수 없는 해시 → home 테스트를 더해 `npx vitest --run`·`npx tsc -b`가 통과한다

## 2. 오늘 날짜와 시계 판정

- [ ] 2.1 `src/domain/clock.ts`에 `checkClock(lastOpenedDate, today)`를 만든다. 검증: 단위 테스트로 정상 진행(갱신)·같은 날·되돌림(유지)·되돌림 해소를 확인한다
- [ ] 2.2 `src/infra/storage/meta.ts`에 `saveLastOpenedDate`를 추가하고 `bootstrap`에서 시작 시 판정·저장한다. 검증: memoryStorage 단위 테스트로 `installId`·`schemaVersion` 유지, `lastOpenedDate`만 갱신, 되돌림 시 저장하지 않음을 확인한다
- [ ] 2.3 `src/app/today.tsx`에 `TodayProvider`·`useToday()`를 만들고(`visibilitychange` visible 때 재계산·재판정), `main.tsx`에 감싸고, `DeckDetail`이 `useToday()`를 쓰게 한다. 검증: `npx tsc -b` 통과, CDP로 `Emulation.setTimezoneOverride`로 날짜를 하루 옮기고 `visibilitychange`를 발생시키면 덱 상세의 "오늘 복습" 수가 새 날짜 기준으로 바뀐다

## 3. 홈 화면

- [ ] 3.1 `src/domain/selectors.ts`에 `overdueCount`·`dueCountBySubject`를 추가한다. 검증: 단위 테스트로 오늘·연체·미래 카드 혼합, 과목별 합, 빈 상태를 확인한다
- [ ] 3.2 `src/screens/Home/Home.tsx`(+CSS 모듈)를 만들고 `App.tsx`에 연결한다. 오늘 복습 수·연체 수·상한 초과 안내·시계 경고·과목별 행·하단 버튼(design 결정 5)·첫 사용 안내를 구현하고 문구(`overflowNotice`·시계 경고 등)는 `screens/messages.ts`에 둔다. 검증: CDP로 오늘 2장+연체 1장+내일 4장 → "오늘 복습 3장·연체 1장", 과목별 수, 과목·덱 관리 → 목록 → 뒤로가기 → 홈, 카드 0장 → 첫 사용 안내·대화상자 없음, 모두 내일 → 안내·학습 시작 없음, 130장 → 상한 안내, `bq:meta.lastOpenedDate`를 미래로 바꾸고 새로고침 → 경고 표시·학습 시작 가능·메타 값 유지, 글자 13px·터치 44px 이상을 확인한다

## 4. 전체 덱 세션과 상한 안내

- [ ] 4.1 `StudySession`의 `deckId`를 선택 값으로 바꾸고(design 결정 6) `App.tsx`에 `studyAll`을 `key="all"`로 연결한다. 시작 시 `overflow`를 고정해 완료 화면 안내에 쓰고, 전체 덱이면 제목 "오늘 복습"·돌아가기 "홈으로"로 한다. 검증: CDP로 덱 2개에 걸친 3장 → 진행 1/3·오래 밀린 순, 완료 → 홈으로 → 오늘 복습 수 감소, 그만하기 → 홈, 빈 큐 `#/study` → 안내·홈으로, 130장 세션 완료 → 상한 안내를 확인한다
- [ ] 4.2 `DeckDetail`에 덱 상한 초과 안내를 추가한다. 검증: CDP로 120장 덱 → "오늘 복습 120장"과 나머지 20장 안내를 확인한다

## 5. 통합 확인

- [ ] 5.1 기존 CDP 스크립트(`crud.mjs` 48·`review.mjs` 24·`study.mjs` 68)의 진입 주소를 `#/subjects`로 바꾸고 목록 복귀 기대를 새 seed에 맞춘 뒤 모두 통과한다. `npx tsc -b`·`npm run lint`·`npm test -- --run`·`npm run build`가 통과한다. 홈·전체 세션 완료 화면 캡처를 사용자에게 공유한다

## Workflow follow-up

- 리뷰 후 커밋·푸시하고 change를 archive한다.
- Day 6 실기기 체크리스트에 "토스 WebView에서 포그라운드 복귀 시 visibilitychange로 날짜 재계산", "홈에서 뒤로가기 = 종료"를 넣는다.
- 이어서 `day4-stats`(통계 화면, `#/stats`, 홈 진입)를 진행한다.
