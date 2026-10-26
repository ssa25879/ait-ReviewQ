# Design

## Context

- 경로는 해시 라우터(`app/router.ts`: `subjects`·`deck`·`cardNew`·`cardEdit`)와 `RouterProvider`(pushState·popstate, 하위 화면 직접 진입 시 `seedRoutes`로 상위 화면 채우기)가 담당한다. 화면 안에 자체 뒤로가기 버튼은 두지 않는다.
- 세션 진행은 `domain/session.ts`(`startSession`·`flip`·`judge`·`progress`·`summarize`·`isFinished`·`currentItem`)의 순수 상태 전이다. `judge`가 첫 판정일 때만 `apply`(`cardId`·`deckId`·`grade`·`date`)를 돌려준다. 큐는 `domain/queue.ts`의 `buildQueue(state, today, { deckId })`.
- 판정 반영은 `actions.reviewCard(cardId, deckId, grade, date)` → `card/review`이고, Provider가 이 액션 뒤 즉시 `flush()`한다. 같은 날 재판정은 리듀서가 무시한다.
- 앱인토스 WebView에서 뒤로가기 가로채기는 `graniteEvent.addEventListener('backEvent', { onEvent })`로 한다. 구독 중에는 기본 뒤로가기가 차단된다(공식 문서 "이벤트 제어하기"). devtools 모의 환경에서는 패널이 `__ait:backEvent` 창 이벤트로 발생시키고, 브라우저 뒤로가기는 별도로 `popstate`로 들어온다.
- 공용 UI: `ConfirmDialog`(취소·확인), `ui.module.css`(`primary`·`secondary`·`bottomBar`·`bottomSpacer`), `screen.module.css`. 테스트는 vitest(DOM 없음)와 scratchpad CDP 스크립트(day2 선례)로 한다.

## Goals / Non-Goals

**Goals:**
- 도메인 로직은 손대지 않고 화면·경로·뒤로가기 가로채기만 더한다.
- 토스 내비게이션 바·Android 백버튼(backEvent)과 브라우저 뒤로가기(popstate)가 같은 확인 흐름을 탄다.

**Non-Goals:**
- 전체 덱 세션 경로(`#/study`)는 홈과 함께 Day 4에 추가한다. 경로 타입은 덱 범위만 둔다.
- 카드 뒤집기 애니메이션, 스와이프 판정.

## Decisions

1. **경로 `{ name: 'study', deckId }` = `#/deck/{deckId}/study`.** `seedRoutes`는 `[subjects, deck]`, `routeTargetExists`는 덱 존재만 본다. 세션 상태는 저장하지 않으므로 새로고침·직접 진입은 그 시점 큐로 새 세션을 만든다(spec "세션 화면 새로고침").
   - 대안: 세션 상태를 sessionStorage에 보관해 새로고침 후 이어 하기 → 기각. 판정은 이미 즉시 저장되고, 남은 카드는 큐 재계산으로 그대로 나온다. 재출제 대기만 사라지는데 일정에 영향이 없다.
2. **세션 상태는 `screens/Study/StudySession.tsx`의 컴포넌트 상태로 둔다.** 마운트 때 `todayLocal()`로 날짜를 한 번 정하고 `buildQueue`→`startSession`을 `useState` 초기화 함수에서 실행한다. 이후 콘텐츠 상태가 바뀌어도 큐를 다시 만들지 않는다. 덱이 바뀌면 `key={deckId}`로 새로 마운트한다.
3. **판정 잠금은 ref로 한다.** 판정 핸들러는 `lockedRef`가 켜져 있으면 무시하고, 켜고 나서 `judge` → (`apply`가 있으면) `dispatch(actions.reviewCard(...))` → `setSession`. 잠금은 `session.index`가 바뀐 뒤 effect에서 푼다. 같은 프레임의 두 번째 클릭은 아직 이전 세션을 클로저로 보고 있어 상태만으로는 막지 못하기 때문이다(막지 않으면 다음 카드를 질문 상태에서 건너뛴다). 버튼 `disabled`(뒤집기 전)는 시각 표시와 보조 기술용이다.
4. **뒤로가기 가로채기는 두 층으로 한다.**
   - (a) 세션 진행 중(큐가 비어 있지 않고 끝나지 않음)에만 `graniteEvent` `backEvent`를 구독하고, `onEvent`에서 확인 다이얼로그를 연다. 토스 내비게이션 바·Android 백버튼 경로다.
   - (b) `RouteContext`에 `setLeaveGuard(guard | null)`을 추가한다. `RouterProvider`의 popstate 처리에서 가드가 있으면 경로를 바꾸지 않고 현재 경로를 `pushState`로 되돌려 넣은 뒤 가드를 호출한다. 브라우저 뒤로가기·devtools·iOS 스와이프처럼 (a)를 거치지 않는 경로다.
   - "그만하기"를 고르면 가드와 구독을 먼저 해제하고 `back()`한다. 되돌려 넣은 항목이 있으므로 한 번의 `back()`으로 덱 상세에 도착한다.
   - 대안: popstate만 쓰기 → 기각. 토스 앱에서 내비게이션 바 뒤로가기가 popstate로 오는지 확인되지 않았고, 공식 방식은 backEvent다. backEvent만 쓰기 → 기각. devtools·브라우저에서 확인 흐름을 검증할 수 없다.
5. **완료 화면은 같은 경로·같은 컴포넌트에서 `isFinished`일 때 그린다.** 요약은 `summarize(session, state)`, 기억함 비율은 `Math.round(remembered / completed * 100)`%. "덱으로 돌아가기"는 `back()`(히스토리상 직전이 덱 상세). 완료·빈 큐 상태에서는 가드·구독이 없으므로 뒤로가기도 바로 덱 상세로 간다.
6. **덱 상세 진입:** `buildQueue(state, today, { deckId })`로 오늘 복습 수(담긴 수 + overflow)를 구한다. 1장 이상이면 머리말에 "오늘 복습 N장"을 보이고 하단에 "카드 추가"(보조)와 "학습하기"(주) 두 버튼을 둔다. 0장이면 머리말에 "오늘 복습할 카드가 없어요"를 보이고 하단은 기존처럼 "카드 추가"만 둔다.
7. **세션 화면 배치(AGENTS.md 하드 규칙·기획서 5.3):** 상단 진행 표시 "n / 전체", 가운데 카드(전체가 하나의 버튼, 뒤집기 전 "눌러서 정답 보기" 힌트), 하단 고정 판정 버튼 2개 좌우 배치(높이 52px, safe area는 기존 `bottomBar`). 본문 15px 이상, `word-break: keep-all`, 긴 질문·정답은 줄바꿈 유지·카드 안 스크롤.
8. **문구는 `screens/messages.ts`에 둔다.** 확인 다이얼로그: 제목 "학습을 그만할까요?", 본문 "지금까지 판정한 카드는 저장됐어요.", 확인 "그만하기", 취소는 기존 "취소".
9. **검증:** 경로 파싱·포맷·seed·대상 존재는 `router.test.ts` 단위 테스트. 화면 동작(뒤집기 전 비활성, 연타 1회, 재출제·진행 수, 완료 요약, 빈 큐, 새로고침, popstate·backEvent 확인과 취소·그만하기, 글자·터치 크기)은 scratchpad CDP 스크립트로 확인한다. 회귀는 day2 CDP 스크립트(48항목)로 본다.

## Risks / Trade-offs

- [토스 앱에서 backEvent 구독 중 내비게이션 바·Android 백버튼이 모두 `onEvent`로 오는지는 실기기에서만 확인된다] → Day 6 실기기 체크리스트 항목으로 둔다. 오지 않더라도 (b) popstate 가드가 남는다.
- [popstate 가드가 현재 경로를 다시 pushState하면 앞으로 가기 기록이 사라진다] → 이 앱은 앞으로 가기를 쓰지 않는다.
- [세션 중 다른 경로로 `navigate`하는 코드가 생기면 가드를 우회한다] → 세션 화면에는 경로 이동 동작이 "그만하기"와 완료 후 돌아가기뿐이다.
- [새로고침하면 재출제 대기 카드가 사라진다] → 일정·로그에는 영향이 없다(재출제 판정은 원래 반영하지 않음).
