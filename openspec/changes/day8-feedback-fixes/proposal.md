# Proposal

## Why

`day8-ux-improvements` 테스트 번들(20261027-4)을 실기기에서 확인한 결과 세 가지가 나왔다.

1. 처음 실행 가이드에서 기기 뒤로가기(토스 내비게이션 바·Android 백버튼)를 누르면 홈이 아니라 미니앱이 닫힌다. 가이드는 앱 시작 때 사용자 조작 없이 히스토리에 쌓이는데, Android WebView(Chrome)는 이런 항목을 기기 뒤로가기에서 건너뛰는 것으로 보인다(가이드 안의 버튼은 `history.back()`이라 정상).
2. 학습 세션에서 "기억 못 함"을 누를 때마다 진행 표시의 전체 수가 늘어나(13 → 16), 홈의 오늘 복습 수·완료 화면의 완료 수와 달라 보인다. 계산은 맞지만(재출제 포함 총수 대 첫 판정 수) 사용자가 오류로 읽는다.
3. 홈 "과목별"의 숫자는 오늘 복습 수인데, 백업을 가져온 뒤처럼 오늘 복습이 없으면 모든 과목이 0장으로 보여 카드가 없어진 것처럼 읽힌다.

## What Changes

- **가이드에서 기기 뒤로가기**: 가이드가 열려 있는 동안 토스 SDK의 뒤로가기 이벤트(`backEvent`)를 받아 앱이 직접 가이드를 연 화면(처음 실행은 홈, 다시 보기는 설정)으로 돌아가게 한다. 학습 세션과 같이 가이드 동안 iOS 스와이프 뒤로가기를 끈다.
- **학습 진행 표시**: 첫 회차는 전체 수를 세션 시작 카드 수로 고정해 "3 / 13"으로 보이고, "기억 못 함"이 있으면 "다시 볼 카드 N장"을 함께 보인다. 첫 회차가 끝나 재출제 카드를 볼 때는 "다시 보기 1 / 3"으로 따로 보인다.
- **학습 완료 화면**: 완료 수(첫 판정 수)는 그대로 두고, 다시 본 카드가 있으면 "다시 본 카드 3장"을 함께 보인다.
- **홈 과목별**: 과목마다 "오늘 N장"과 "전체 M장"을 함께 보인다.

범위 밖: 하위 화면 주소로 직접 열었을 때의 상위 화면 seed(같은 원인이지만 지금 진입 경로가 없음), 재출제 규칙 자체(첫 판정만 반영·1회 재출제)는 바꾸지 않는다.

선행: `day7-backup-code`·`day8-ux-improvements`를 먼저 보관한다(이 change가 `onboarding` 스펙에 요구사항을 더한다).

## Capabilities

### New Capabilities
(없음)

### Modified Capabilities
- `onboarding`: 가이드가 열려 있는 동안의 기기 뒤로가기 처리 요구사항을 더한다.
- `review-session`: 진행 표시를 첫 회차(분모 고정)와 다시 보기 구간으로 나누고, 세션 요약에 다시 본 카드 수를 더한다.
- `study-screens`: 진행 표시 문구와 학습 완료 화면의 다시 본 카드 수.
- `home-screen`: 과목별 요약에 전체 카드 수를 함께 보인다.

## Impact

- 코드: `reviewq/src/screens/Guide/Guide.tsx`(backEvent 구독·iOS 스와이프), `reviewq/src/domain/session.ts`(`progress`·`summarize`·시작 카드 수), `reviewq/src/screens/Study/StudySession.tsx`, `reviewq/src/domain/selectors.ts`(과목별 전체 수), `reviewq/src/screens/Home/Home.tsx`, `reviewq/src/screens/messages.ts`.
- 테스트: `session.test.ts`·`selectors.test.ts` 단위 테스트, CDP `study.mjs`·`home.mjs`·`ux.mjs` 기대값 갱신.
- 저장 형식·권한 변경 없음.
