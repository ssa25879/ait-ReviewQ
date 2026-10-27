# Tasks

모든 경로는 `reviewq/` 기준이다. 선행 조건: `day4-home-queue` 구현·아카이브 완료(홈·`useToday()`·`home` 경로). 화면 검증은 scratchpad의 CDP 스크립트(헤드리스 Edge, PowerShell에서 node 실행, 출력 폴더 절대 경로)로 한다.

## 1. 통계 계산

- [x] 1.1 `src/domain/stats.ts`에 `todayDoneCount`·`stageDistribution`·`recentDailyCounts`를 만든다(design 결정 1). 검증: `stats.test.ts`로 오늘 3건(재출제 제외) → 3, 분포 합 = 전체 카드 수, 2026-11-02 기준 월 경계 7일(10-27~11-02, 10-26 제외), 빈 상태(모두 0)를 확인하고 `npx vitest --run`이 통과한다

## 2. 경로와 화면

- [x] 2.1 `src/app/router.ts`에 `stats`(`#/stats`, seed `[home]`)를 추가한다. 검증: `router.test.ts`에 왕복·seed·`#/statsx` → home 테스트를 더해 통과한다
- [x] 2.2 `src/screens/Stats/Stats.tsx`(+CSS 모듈)를 만들고 `App.tsx`에 연결한다. 문구는 `screens/messages.ts`에 둔다(design 결정 3). 검증: CDP로 카드 4장(stage 0 2장·1 1장·3 1장)과 오늘 판정 → 오늘 완료·전체 카드·단계 분포 수치, 7일 행 7개와 오늘 라벨, 카드 0장 → 빈 상태, 글자 13px·터치 44px 이상을 확인한다
- [x] 2.3 홈에 "통계" 행을 추가한다(design 결정 4). 검증: CDP로 홈 → 통계 → 뒤로가기 → 홈, 통계 화면 새로고침 → 통계 유지·뒤로가기 → 홈을 확인한다

## 3. 통합 확인

- [x] 3.1 `npx tsc -b`·`npm run lint`·`npm test -- --run`·`npm run build`가 통과하고, 기존 CDP 스크립트(day2·day3-scheduler·study·day4 home)가 그대로 통과한다. 통계 화면 캡처를 사용자에게 공유한다

## Workflow follow-up

- 리뷰 후 커밋·푸시하고 change를 archive한다.
- 다음은 Day 5(저장 안정화·예외 UI·AdSlot·알림 동의 UI, 플래그 off)다.
