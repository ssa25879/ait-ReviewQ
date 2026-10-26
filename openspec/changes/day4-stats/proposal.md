# Proposal

## Why

판정 기록(월별 ReviewLog)과 카드 단계는 저장되지만, 사용자가 자신의 학습량과 기억 상태를 볼 화면이 없다. 기획서 F9(진행률·기본 통계, P1)와 5.2 통계 화면을 최소 범위(숫자 요약 + 간단한 막대)로 제공해 꾸준히 복습할 동기를 준다. 데이터는 이미 있으므로 계산과 화면만 더하면 된다.

## What Changes

- 통계 화면(새 경로 `#/stats`)을 추가한다. 보여 주는 항목은 다음과 같다.
  - 오늘 완료 수: 오늘 날짜로 남은 판정 기록 수
  - 전체 카드 수
  - 단계별 분포: 새 카드·다시 학습(stage 0)과 간격 1·3·7·14·30·60일 단계별 카드 수
  - 최근 7일 학습 수: 오늘 포함 7일의 날짜별 판정 기록 수
- 홈에 "통계" 진입을 추가한다. 통계 화면에서 뒤로가기를 누르면 홈으로 돌아간다.
- 카드가 없으면 통계 화면에 빈 상태 안내를 보여 준다.
- 화면은 조회만 한다.

범위 밖: 그래프 라이브러리, 기간 선택, 덱·과목별 통계, 기억률 추이, 설정 화면.

## Capabilities

### New Capabilities
- `stats-screen`: 통계 화면이 보여 주는 학습 수치(오늘 완료, 전체 카드, 단계 분포, 최근 7일)의 정의와 진입·빈 상태 규칙.

### Modified Capabilities
(없음. 홈의 통계 진입은 `stats-screen`의 요구사항으로 정의한다. 일반 화면 이동·뒤로가기는 기존 `app-navigation`이 다룬다.)

## Impact

- 코드: `reviewq/src/domain/stats.ts`(신설, 순수 계산), `reviewq/src/screens/Stats/`(신설), `reviewq/src/app/router.ts`(`stats` 경로), `reviewq/src/App.tsx`, `reviewq/src/screens/Home/Home.tsx`(진입), `reviewq/src/screens/messages.ts`.
- 선행 조건: `day4-home-queue`(홈 화면, `useToday()`, `home` 경로)를 구현·아카이브한 뒤 진행한다.
- 저장 형식·의존성 변경 없음.
