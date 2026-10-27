# Design

## Context

- 판정 기록은 `ContentState.logs`(`'YYYY-MM'` → `ReviewLog[]`)에 있고, 앱 시작 때 이번 달과 지난달 키만 로드한다(data-storage "리뷰 로그 로드"). 최근 7일은 항상 이 두 달 안에 든다.
- `ReviewLog.date`는 세션 날짜다. 재출제 판정은 기록이 남지 않는다(review-session).
- 카드 단계는 `card.schedule.stage`(0~6)이고, 간격표는 `INTERVALS = [1, 3, 7, 14, 30, 60]`(`domain/scheduler/fixedInterval.ts`)이다.
- 선행 change `day4-home-queue`가 `home` 경로(`#/`), `useToday()`, 홈 화면을 만든다. 이 change는 그것을 전제로 한다.

## Goals / Non-Goals

**Goals:**
- 수치 계산을 순수 함수로 분리해 "로그 기반 수치가 수동 계산과 일치"(F9 완료 조건)를 단위 테스트로 보장한다.

**Non-Goals:**
- 그래프 라이브러리 도입(기획서 "지연 시 그래프 제외, 숫자 요약만").
- 지난달 이전 로그 추가 로드.

## Decisions

1. **계산은 `domain/stats.ts` 하나에 둔다.**
   - `todayDoneCount(state, today)`: `logs[today.slice(0,7)]` 중 `date === today`인 건수.
   - `stageDistribution(state)`: 길이 7 배열(stage 0~6). 범위 밖 stage는 0~6으로 자른다(방어).
   - `recentDailyCounts(state, today, days = 7)`: `addDays(today, -6..0)`의 날짜별 건수를 오래된 날부터 반환한다. 날짜마다 해당 월 키를 찾는다.
   - 대안: 화면에서 직접 계산 → 기각. 월 경계·빈 상태를 단위 테스트하기 어렵다.
2. **경로 `stats` = `#/stats`, seed `[home]`.** `routeTargetExists`는 항상 true다.
3. **화면(`screens/Stats/Stats.tsx`) 배치.**
   - 제목 "통계"를 둔다.
   - 숫자 요약 2칸: "오늘 완료 N장", "전체 카드 N장". 학습 완료 화면의 `dl` 카드 스타일을 재사용한다.
   - 단계 분포 7행: 라벨("새 카드·다시 학습", "1일 간격" … "60일 간격"), 수, CSS 막대(최댓값 대비 너비 %).
   - 최근 7일 7행: 라벨("M월 D일", 오늘은 "오늘"), 수, 같은 막대.
   - 막대는 장식이므로 `aria-hidden`, 수치는 텍스트로 둔다. 하단 고정 버튼은 없다(조회 전용, 뒤로가기는 플랫폼).
   - 카드 0장이면 빈 상태 카드만 보인다.
4. **홈 진입.** 홈 본문의 과목별 요약 아래에 "통계" 행(누르면 `#/stats`, 꺾쇠는 SVG 아이콘)을 둔다. 하단 버튼 영역은 바꾸지 않는다(기획서 5.4: 기능 버튼 최소화).
5. **"오늘"은 `useToday()`를 쓴다.** 포그라운드 복귀 시 날짜가 바뀌면 수치도 바뀐다.
6. **검증.** `stats.test.ts`로 오늘 완료(재출제 제외), 분포 합 = 전체, 월 경계 7일, 빈 상태를 확인한다. 화면은 CDP 스크립트 `stats.mjs`로 확인한다.

## Risks / Trade-offs

- [앱을 연 채 두 번 이상 월이 바뀌면 7일 구간의 앞쪽 달 로그가 로드되어 있지 않을 수 있다] → 앱 재실행 시 해소된다. 실사용에서 드물어 추가 로드는 하지 않는다.
- [막대 길이만으로는 값을 알 수 없다] → 수치를 항상 텍스트로 같이 보인다.
