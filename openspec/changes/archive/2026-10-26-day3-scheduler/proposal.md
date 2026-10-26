# Proposal

## Why

기획서 11장 Day 3의 완료 조건은 "12장 스케줄러 단위 테스트가 모두 통과한다"이다. 지금은 카드에 초기 일정(stage 0, 오늘 복습)만 붙고, 판정 결과로 다음 복습일을 계산하는 규칙·복습할 카드를 고르는 규칙·판정 기록(ReviewLog)이 없다. 학습 세션 화면(day3-study-session)이 딛고 설 이 규칙들을 먼저 순수 로직으로 고정하고 테스트한다.

## What Changes

- 날짜 계산: `addDays`(달력 일 단위, 월말·연말·윤년 경계), `isDue`.
- 고정 간격 스케줄러(기획서 6.1~6.2): 간격표 1·3·7·14·30·60일, 기억함은 한 단계 상승(최대 6단계, 연체 보너스 없음), 기억 못 함은 stage 0·다음 날, 같은 날 두 번째 판정은 반영하지 않음.
- 복습 큐: 다음 복습일이 기준일 이하인 카드, 오래 밀린 순(같으면 생성 순), 하루 상한 100장. 덱 하나 또는 전체를 대상으로 만든다.
- 판정 반영: 카드 일정 갱신과 ReviewLog 1건 기록을 한 번의 상태 전이로 처리한다. 일정이 바뀌지 않은 판정(같은 날 재판정)은 로그를 남기지 않는다.
- 학습 세션 진행 규칙(순수 상태 전이): 세션 시작 날짜 고정, 뒤집기 전 판정 불가, 카드별 첫 판정만 일정에 반영, 기억 못 한 카드는 세션 끝에 1회 재출제(재출제 판정은 일정·로그에 반영하지 않음), 세션 요약(완료 수·기억함 수·내일 예정 수).
- 리뷰 로그 저장: 월별 키 `bq:logs:{YYYY-MM}`. 앱 시작 시 이번 달·지난달 로그를 불러오고, 바뀐 달 키만 저장한다.
- 판정은 지연 없이 즉시 저장한다(기획서 12.3 D-01). 그 밖의 편집은 기존 400ms 지연 저장을 유지한다.

범위 밖: 세션·완료 화면과 세션 중 뒤로가기 확인(day3-study-session), 홈 오늘 큐 화면·연체 표시·기기 시계 역행 경고(Day 4), 통계(Day 4), 추가 연습 모드(F12, P1), 하루 상한 초과 안내 UI(Day 4).

## Capabilities

### New Capabilities
- `review-scheduling`: 판정에 따른 다음 복습일 계산 규칙, 날짜 계산, 같은 날 중복 판정 처리, 판정 기록(ReviewLog) 생성 규칙.
- `review-queue`: 기준일에 복습할 카드를 고르고 정렬하고 상한을 적용하는 규칙.
- `review-session`: 한 번의 학습 세션 진행 규칙(시작 날짜 고정, 뒤집기·판정 순서, 첫 판정만 반영, 재출제, 요약).

### Modified Capabilities
- `data-storage`: 리뷰 로그 월별 로드·저장 요구사항과 판정 즉시 저장 요구사항을 추가한다.

## Impact

- 코드: `reviewq/src/utils/date.ts`(addDays·isDue 추가), `reviewq/src/domain/scheduler/fixedInterval.ts`, `reviewq/src/domain/queue.ts`, `reviewq/src/domain/session.ts`(신설), `reviewq/src/domain/content.ts`(로그 상태·판정 액션), `reviewq/src/infra/storage/`(로드·변경 키에 로그 포함), `reviewq/src/app/`(판정 즉시 저장).
- 저장 형식: `ContentState`에 월별 로그가 추가되지만 기존 키 형식은 그대로다. `bq:logs:{YYYY-MM}`를 처음 쓰기 시작한다. `schemaVersion` 변경 없음.
- 의존성: 추가 없음. 화면 변화 없음.
