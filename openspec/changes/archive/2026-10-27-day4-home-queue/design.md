# Design

## Context

- 경로는 해시 라우터다(`app/router.ts`: `subjects`(`#/`)·`deck`·`cardNew`·`cardEdit`·`study`). `RouterProvider`가 처음 열릴 때 `history.state`에 앱 표시(`ENTRY`)가 없으면 `seedRoutes`로 상위 화면을 히스토리에 채운다. `App.tsx`는 대상이 없으면 `replace({ name: 'subjects' })`로 바꾼다.
- 큐는 `domain/queue.ts`의 `buildQueue(state, today, { deckId? })`다. `deckId`를 빼면 이미 전체 덱이 대상이고, `overflow`로 상한(100장) 때문에 빠진 수를 돌려준다. 세션 화면 `screens/Study/StudySession.tsx`는 `deckId`가 필수다.
- 화면은 렌더할 때마다 `todayLocal()`을 직접 부른다(`DeckDetail`). 그래서 다른 이유로 다시 렌더되기 전까지 자정이 지나도 숫자가 그대로다.
- `bq:meta`(`Meta.lastOpenedDate`)는 첫 실행 때만 쓰이고 이후 갱신되지 않는다(`infra/storage/meta.ts` `initMeta`). `bootstrap`이 `meta`를 돌려주지만 화면은 쓰지 않는다.
- `ContentProvider`는 `visibilitychange`(hidden)에서 저장 flush만 한다. 토스 WebView에서 이 이벤트가 오는지는 기획서상 [검증 필요]다.
- 검증 선례: vitest 단위 테스트, scratchpad의 헤드리스 Edge CDP 스크립트(day2 `crud.mjs` 48항목, day3 `review.mjs` 24항목, `study.mjs` 68항목). 기존 스크립트는 `#/`를 과목·덱 목록으로 가정한다.

## Goals / Non-Goals

**Goals:**
- 홈 숫자와 전체 덱 세션 카드 수를 같은 `buildQueue` 결과에서 얻는다(F7 완료 조건).
- "오늘" 날짜를 한 곳에서 관리해 포그라운드 복귀와 시계 되돌림 판정이 모든 화면에 같은 값을 주게 한다.
- 기존 세션 화면 규칙(뒤집기·잠금·뒤로가기 확인)은 그대로 재사용한다.

**Non-Goals:**
- 통계 화면과 홈의 통계 진입(`day4-stats`).
- 시간대 변경, 새벽 4시 경계 옵션.
- 탭바(기획서 5.4: MVP는 탭바 없이 홈 중심).

## Decisions

1. **경로 재배치.** `home`=`#/`, `subjects`=`#/subjects`, 전체 덱 세션 `studyAll`=`#/study`. 덱 세션 `study`(`#/deck/{id}/study`)는 그대로 둔다.
   - `seedRoutes`: `subjects` → `[home]`, `deck` → `[home, subjects]`, `cardNew`·`cardEdit`·`study` → `[home, subjects, deck]`, `studyAll` → `[home]`.
   - 알 수 없는 해시와 없는 대상은 `home`으로 바꾼다(`parseRoute` 기본값, `App`의 `replace`).
   - 덱 세션과 전체 세션을 `study`의 선택적 `deckId`로 합치지 않고 이름을 나눈다. switch 문마다 `deckId` 유무 분기를 두지 않기 위해서다.
   - 대안: 과목·덱 목록을 `#/`에 두고 홈을 `#/home`으로 → 기각. 최초 화면이 `#/`가 아니면 seed 체인과 "최초 화면에서 뒤로가기 = 종료"가 어긋난다.
2. **"오늘"은 `TodayProvider`(`app/today.tsx`) 하나가 관리한다.** 값은 `{ today, clockRolledBack, lastOpenedDate }`.
   - 시작 값은 `todayLocal()`이고, `bootstrap`이 끝나면 저장된 `meta`로 시계 판정을 한 번 한다.
   - `visibilitychange`에서 `visible`이 되면 `todayLocal()`을 다시 구해 날짜가 바뀌었거나 판정이 달라졌을 때만 상태를 바꾼다.
   - 화면은 `useToday()`로 읽는다(홈, 덱 상세). 세션 화면은 지금처럼 마운트 때 `todayLocal()`을 직접 써서 세션 날짜를 고정한다. 복귀 이벤트가 늦게 와도 세션 시작 날짜가 최신이어야 하기 때문이다.
   - 대안: `ContentProvider`에 넣기 → 기각. 저장·리듀서와 무관한 상태라 책임이 섞인다.
3. **시계 판정은 순수 함수로 둔다.** `checkClock(lastOpenedDate, today) → { rolledBack, lastOpenedDate }`(`domain/clock.ts`).
   - `today < lastOpenedDate`이면 되돌림이고 `lastOpenedDate`는 그대로다. 아니면 되돌림이 아니고 `lastOpenedDate = today`다.
   - 값이 바뀐 경우에만 `saveLastOpenedDate(storage, meta, date)`(`infra/storage/meta.ts`)로 `bq:meta`를 바로 저장한다. 콘텐츠 저장 큐(`saveQueue`)는 콘텐츠 키 전용이라 거치지 않는다.
   - 저장이 실패하면 콘솔 오류만 남긴다. 다음 시작이나 복귀 때 다시 시도되고, 화면 동작에는 영향이 없다.
4. **홈 숫자 계산.**
   - 오늘 복습 수 = `buildQueue(state, today)`의 `cards.length + overflow`.
   - 연체 수 = 다음 복습일이 `today`보다 이전인 카드 수(`overdueCount`).
   - 과목별 수 = 과목의 덱마다 `buildQueue(..., { deckId })` 합(`dueCountBySubject`).
   - 셋 다 `domain/selectors.ts`에 두고 단위 테스트한다. 3,000장 기준 렌더당 O(n log n)이라 F-04(2초 이내) 안이다.
5. **홈 배치(AGENTS.md 하드 규칙·기획서 5.4).**
   - 순서: 제목 "오늘 복습", 큰 숫자 "N장", 보조 "연체 M장"(0이면 숨김), 상한 초과 안내, 시계 되돌림 경고(경고 색 토큰, 화면 안 카드), 과목별 행(누르면 과목·덱 목록).
   - 하단 고정: 오늘 복습이 있으면 "과목·덱 관리"(보조)와 "학습 시작"(주), 없으면 "과목·덱 관리"(주)만 둔다.
   - 카드가 0장이면 첫 사용 안내 카드를 보이고, 하단은 "과목·덱 만들기"(주)로 둔다.
   - 대화상자는 띄우지 않는다.
6. **세션 화면 일반화.** `StudySession`의 `deckId`를 선택 값으로 바꾼다.
   - 없으면 전체 덱이 대상이다. 제목은 "오늘 복습"이고, 돌아가기 문구는 "홈으로"다.
   - 시작할 때 `overflow`를 세션과 함께 고정해 완료 화면 안내에 쓴다.
   - `App`은 `studyAll`을 `<StudySession key="all" />`로 연결한다. 덱 존재 확인은 `deckId`가 있을 때만 한다.
   - 뒤로가기 가드·`backEvent`·iOS 스와이프 처리는 그대로다. 돌아가기는 계속 `back()`이고, 히스토리상 직전이 덱 상세나 홈이다.
7. **상한 안내 문구는 하나로 둔다.** `overflowNotice(n)` = "오늘은 100장까지 학습해요. 나머지 N장은 내일 이어서 나와요."(`screens/messages.ts`). 홈·덱 상세·완료 화면이 같이 쓴다.
8. **시계 경고 문구.** "기기 날짜가 마지막으로 앱을 연 날(M월 D일)보다 이전이에요. 날짜 설정을 확인해 주세요." 학습·편집은 막지 않는다(spec). 판정은 그 기기 날짜로 반영된다. 미래 예정 카드는 큐에 나오지 않으므로(S-10) 일정이 앞당겨지지 않는다.
9. **검증.**
   - 경로·selectors·`checkClock`·`saveLastOpenedDate`는 vitest로 확인한다.
   - 화면은 새 CDP 스크립트 `home.mjs`로 확인한다.
     - 포그라운드 재계산: `Emulation.setTimezoneOverride`로 로컬 날짜를 하루 옮긴 뒤 `visibilitychange`를 발생시킨다.
     - 시계 되돌림: `bq:meta.lastOpenedDate`를 미래 날짜로 바꾸고 새로고침한다.
     - 상한: 카드 130장을 디스패치로 만든다.
   - 기존 스크립트 3개는 진입 주소를 `#/subjects`로 바꾸고, "목록으로 돌아옴" 기대를 새 seed에 맞춘다. 바꾼 줄은 결과 보고에 적는다.

## Risks / Trade-offs

- [토스 WebView에서 `visibilitychange`(visible)가 오지 않을 수 있다] → 그 경우 다음 렌더 기회(화면 이동)까지 날짜가 늦게 바뀐다. 세션 시작 날짜는 마운트 때 직접 구하므로 판정 날짜는 틀리지 않는다. Day 6 실기기 체크리스트(기획서 13장 "포그라운드로 돌아오면 날짜가 다시 계산된다")로 확인한다.
- [기존 사용자 히스토리] 이미 `ENTRY` 표시가 있는 히스토리는 다시 seed하지 않는다. 예전 `#/`(과목·덱 목록) 항목은 홈으로 보이고, 덱 상세에서 뒤로가면 과목·덱 목록을 건너뛰고 홈으로 갈 수 있다. 데이터에는 영향이 없고 앱을 새로 열면 정상이다.
- [시계 되돌림 상태에서 판정] 되돌린 날짜 기준으로 다음 복습일이 계산된다. 큐에는 원래 예정일이 지난 카드만 나오므로 일정이 앞당겨지지는 않는다. 다만 `lastReviewedDate`가 실제보다 이전 날짜로 남는다 → 경고로 알리는 것까지만 하고, 차단은 하지 않는다(기획서 6.4).
- [`bq:meta` 저장이 콘텐츠 저장과 따로 간다] 메타 저장이 실패해도 콘텐츠는 영향이 없다. 실패는 다음 판정 때 다시 시도된다.

## Migration Plan

- 저장 형식 변경은 없다. 배포 후 첫 실행에서 `lastOpenedDate`가 오늘로 갱신된다.
- 되돌리기: 이전 번들로 롤백하면 `#/`가 다시 과목·덱 목록이 된다. `#/subjects`·`#/study` 주소는 이전 번들에서 알 수 없는 해시로 처리되어 목록으로 간다.
