# Design

## Context

- 실기기(20261027-4) 확인: 처음 실행 가이드에서 기기 뒤로가기 → 미니앱 종료. 가이드 안 버튼(`history.back()`)은 정상. CDP(헤드리스 Edge)에서는 재현되지 않았다.
- 가이드는 `App`이 첫 ready 때 `navigate({ name: 'guide' })`로 사용자 조작 없이 히스토리에 쌓는다. Chrome·Android WebView는 사용자 활성화 없이 추가된 히스토리 항목을 기기 뒤로가기에서 건너뛴다(history manipulation intervention). 그래서 [홈, 가이드]에서 뒤로가기를 누르면 홈 항목까지 건너뛰고 앱을 벗어난 것으로 추정한다.
- 학습 세션(`StudySession.tsx`)은 이미 `graniteEvent.addEventListener('backEvent', …)`로 기기 뒤로가기를 직접 받고, 세션 중 `setIosSwipeGestureEnabled({ isEnabled: false })`로 iOS 스와이프를 끈다. 실기기에서 동작하는 경로다.
- 세션 진행은 `domain/session.ts`의 `progress(session)`이 `{ current: index + 1, total: order.length }`(재출제 포함)를 돌려준다. 데모 데이터 CDP 확인: 홈 13장 → "1 / 13" → 기억 못 함 3번 → "16 / 16", 완료 화면 "완료 13장".
- 홈 과목별은 `dueCountBySubject`(오늘 복습 수)만 쓴다.

## Goals / Non-Goals

**Goals:**
- 가이드에서 기기 뒤로가기가 앱을 닫지 않는다.
- 세션의 전체 수가 홈의 오늘 복습 수와 같게 보이고, 재출제는 따로 보인다.
- 오늘 복습이 0이어도 과목에 카드가 있다는 것이 보인다.

**Non-Goals:**
- 하위 화면 직접 진입 seed의 같은 문제, 재출제 규칙 변경.

## Decisions

1. **가이드에서 `backEvent` 구독(`Guide.tsx`).** 마운트 동안 `graniteEvent.addEventListener('backEvent', { onEvent: back })`, iOS 스와이프 끔. 언마운트 때 해제·스와이프 복원(학습 세션과 같은 방식, 거부·미지원은 무시). `back()`은 앱이 부르는 `history.back()`이라 건너뛰기 대상이 아니다. 처음 실행은 [홈, 가이드] → 홈, 다시 보기는 [홈, 설정, 가이드] → 설정.
   - 대안: 가이드를 히스토리 항목 없이 홈 위 오버레이로 띄우기 → 기각. 홈 스펙의 "진입 직후 대화상자 금지"와 부딪히고, 다시 보기 경로와 처리가 갈라진다.
2. **세션 진행 두 구간(`session.ts`).**
   - `SessionState`에 `initialCount`(시작 큐 길이)를 더한다. `startSession`이 채운다.
   - `progress(session)` → `{ phase: 'first' | 'retry', current, total, pendingRetry }`. 첫 회차(`index < initialCount`): `current = index + 1`, `total = initialCount`, `pendingRetry = order.length - initialCount`(지금까지 기억 못 함 수). 다시 보기(`index ≥ initialCount`): `current = index - initialCount + 1`, `total = order.length - initialCount`. 끝난 세션은 마지막 구간 값으로 고정한다.
   - 재출제는 첫 판정이 기억 못 함일 때만 1회라, 다시 보기 구간에 들어선 뒤에는 `total`이 더 늘지 않는다.
   - `summarize`에 `retried`(첫 판정이 기억 못 함인 카드 수)를 더한다.
3. **세션 화면 문구(`StudySession.tsx`, `messages.ts` `STUDY`).** 첫 회차 "3 / 13"과, `pendingRetry > 0`이면 옆에 "다시 볼 카드 2장". 다시 보기 구간은 "다시 보기 1 / 3". 스크린리더 문장(`progressLabel`)도 구간을 말하게 바꾼다. 완료 화면 요약에 `retried > 0`일 때 "다시 본 카드 N장" 항목.
4. **홈 과목별(`selectors.ts`, `Home.tsx`).** `cardCountBySubject(state)`를 더하고, 과목 행 오른쪽을 "오늘 2장"(강조), 아래 줄(`rowSub`)에 "전체 5장"으로 둔다. 기존 `dueCountBySubject`는 그대로 쓴다.
5. **검증.**
   - 단위: `session.test.ts`(첫 회차 분모 고정·`pendingRetry`·다시 보기 구간·끝난 세션·`retried`), `selectors.test.ts`(`cardCountBySubject`).
   - CDP: `ux.mjs`에 devtools 모의 `__ait:backEvent` 이벤트로 처음 실행·다시 보기 가이드에서 뒤로가기 → 홈·설정, 구독 해제(`__aitDevtoolsBackSubscribers__` 0), `study.mjs` 재출제 기대값을 새 표시로, `home.mjs` 과목별 기대값을 새 표시로 고친다(바꾼 줄은 보고에 적기).
   - 실기기: 처음 실행 가이드에서 토스 내비게이션 바·Android 백버튼 → 홈(이 change의 핵심 확인 항목, CDP로 대신할 수 없음).

## Risks / Trade-offs

- [원인이 히스토리 건너뛰기가 아닐 수 있다] → `backEvent`를 직접 받으면 원인과 관계없이 플랫폼 기본 동작(종료) 대신 앱이 처리한다. 실기기에서 확인한다.
- [iOS 스와이프를 끄면 가이드에서 스와이프로 나갈 수 없다] → 내비게이션 바 뒤로가기·건너뛰기 버튼이 남는다. 학습 세션과 같은 정책이다.
- [진행 표시 문구가 늘어 좁은 화면에서 줄바꿈될 수 있다] → "다시 볼 카드 N장"은 메타 문구 크기로 두고, 375px 폭 CDP 캡처로 확인한다.

## Migration Plan

- 저장 형식 변경 없음. 세션 상태는 저장하지 않으므로 이전 버전과 호환 문제가 없다.
