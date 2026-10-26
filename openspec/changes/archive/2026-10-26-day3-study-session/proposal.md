# Proposal

## Why

day3-scheduler로 판정 규칙(스케줄러·큐·세션 진행·판정 즉시 저장)은 순수 로직과 테스트로 고정됐지만, 사용자가 실제로 카드를 뒤집고 판정할 화면이 없다. 기획서 Day 3의 "학습 세션(Session)"과 F4(카드 뒤집기)·F5(판정 기록, 연타 시 1회만 처리)를 화면으로 완성해 앱의 핵심 루프(카드 작성 → 학습 → 다음 복습일 갱신)를 처음으로 끝까지 연결한다.

## What Changes

- 덱 상세에 "이 덱 학습" 진입을 추가한다. 오늘 복습할 카드 수를 함께 보여 주고, 0장이면 진입 대신 안내를 보여 준다.
- 학습 세션 화면(새 경로 `#/deck/{deckId}/study`): 진행 표시(n/전체), 카드 영역 탭으로 질문 → 정답 뒤집기, 하단 고정 판정 버튼 2개(기억 못 함·기억함). 뒤집기 전에는 판정 버튼을 비활성화하고, 판정 직후 다음 카드가 그려질 때까지 입력을 잠가 연타를 1회로 처리한다.
- 판정은 day3-scheduler의 `session.judge` → `actions.reviewCard`로 반영한다(첫 판정만 일정·로그, 판정 즉시 저장 유지).
- 학습 완료 화면(같은 경로에서 세션 종료 시): 완료 수, 기억함 비율, 내일 예정 수, "덱으로 돌아가기".
- 세션 진행 중 뒤로가기(토스 내비게이션 바·Android 백버튼·브라우저 뒤로가기)는 "학습 그만하기" 확인으로 처리한다. 확인하면 덱 상세로 돌아가고, 취소하면 같은 카드에 머문다. 완료 화면과 빈 큐 화면에서는 확인 없이 돌아간다.
- 세션 화면을 새로고침하거나 주소로 바로 열면 그 시점의 큐로 새 세션을 시작한다(이미 판정한 카드는 예정일이 바뀌어 다시 나오지 않는다).

범위 밖: 홈 화면과 전체 덱 오늘 큐 세션, 하루 상한 초과 안내, 연체 표시(Day 4), 추가 연습 모드(F12, P1), 완료 화면의 광고·알림 동의 버튼(Day 5, 플래그 off), 세션 중 포그라운드 복귀 시 날짜 재계산(Day 4).

## Capabilities

### New Capabilities
- `study-screens`: 학습 세션 화면과 학습 완료 화면의 표시·조작 규칙(진행 표시, 뒤집기, 판정 버튼 활성·잠금, 완료 요약, 빈 큐, 새로고침).

### Modified Capabilities
- `content-screens`: 덱 상세에 오늘 복습 카드 수와 "이 덱 학습" 진입을 추가한다.
- `app-navigation`: 학습 세션 진행 중 뒤로가기를 확인으로 처리하는 요구사항을 추가한다.

## Impact

- 코드: `reviewq/src/app/router.ts`(study 경로), `reviewq/src/app/RouterProvider.tsx`·`routeContext.ts`(뒤로가기 가로채기), `reviewq/src/App.tsx`(화면 연결), `reviewq/src/screens/DeckDetail/`(진입), `reviewq/src/screens/Study/`(신설), `reviewq/src/screens/messages.ts`(문구).
- 플랫폼: `@apps-in-toss/web-framework`의 `graniteEvent` `backEvent` 구독을 처음 사용한다(구독 중 기본 뒤로가기 차단).
- 저장 형식·의존성 변경 없음. 도메인 로직(`domain/session`·`queue`·`content`)은 그대로 쓴다.
