# Design

## Context

- `domain/scheduler/types.ts`에 `Grade`·`CardSchedule`·`Scheduler` 인터페이스, `scheduler/constants.ts`에 `ALGORITHM_ID`·`ALGORITHM_VERSION`이 있다. 신규 카드는 stage 0·오늘 복습으로 만들어진다.
- `ContentState = { subjects, decks, cards }`이고, 저장은 `diffContent`(참조 비교 변경 키) → `saveQueue`(400ms 디바운스, `flush()`)로 한다. 로드는 `loadContent`가 과목·덱·덱별 카드를 읽는다. Provider는 상태가 바뀌면 변경 키를 큐에 넣는다.
- `utils/date.ts`에는 `todayLocal`만 있다. 기획서 6.3의 `addDays`(UTC 자정 기준 연·월·일 계산)·`isDue` 예시가 있다.
- `ReviewLog`(id, cardId, date, grade, prevStage, nextStage, reviewedAt) 타입은 있으나 아직 기록·저장하지 않는다. `keys.ts`에 `logsKey(date)`가 있다.

## Goals / Non-Goals

**Goals:**
- 스케줄러·큐·세션 진행을 React와 무관한 순수 함수로 두어 기획서 12.1(S-01~S-10)을 단위 테스트로 검증한다.
- 판정 반영(일정 + 로그)을 기존 리듀서·변경 키·저장 큐 흐름에 그대로 얹는다.

**Non-Goals:**
- 화면, Meta `lastOpenedDate` 갱신과 시계 역행 경고(Day 4), 로그 보존 기간·정리, Meta에 로그 월 목록 두기(기획서 7.3 가정 — 로드 범위를 날짜로 계산하므로 불필요).

## Decisions

1. **스케줄러는 기획서 6.5 예시를 따른 순수 객체다(`scheduler/fixedInterval.ts`).** `INTERVALS = [1, 3, 7, 14, 30, 60]`, `schedule(state, grade, today)`는 같은 날이면 입력 객체를 그대로(같은 참조) 돌려준다. 호출자는 참조 비교로 "반영 안 됨"을 판단해 로그를 남기지 않는다.
2. **`addDays`는 `Date.UTC`로 연·월·일만 계산한다(`utils/date.ts`).** 로컬 시간대·일광절약시간 영향을 받지 않는다. `isDue(due, today)`는 문자열 사전순 비교.
3. **판정은 리듀서 액션 `card/review`로 처리한다.** payload: `cardId`, `deckId`, `grade`, `date`(세션 날짜), `now`(ISO), `logId`. 리듀서가 스케줄러를 호출하고, 일정이 바뀌면 해당 덱 카드 배열과 해당 월 로그 배열만 새로 만든다(다른 참조 유지). 바뀌지 않으면 상태 그대로(no-op). 스케줄러 선택은 리듀서가 `fixedIntervalScheduler`를 직접 쓴다(교체 가능 구조는 인터페이스로 유지, 주입은 필요해질 때).
4. **로그 상태는 `ContentState.logs: Record<'YYYY-MM', ReviewLog[]>`로 둔다.** 저장 키 구조(월별)와 맞춰 `diffContent`가 참조 비교로 `bq:logs:{month}`를 찾는다. 로그 월 키는 삭제하지 않는다(덱 삭제 시에도 로그는 남김 — day2-data-layer 결정 유지).
   - 대안: 로그를 별도 Provider/상태로 분리 → 기각(판정 1회가 카드와 로그를 함께 바꾸므로 한 상태 전이가 단순하다).
5. **로드 범위는 이번 달과 지난달이다(`loadContent(storage, today)`).** Day 4 통계의 "최근 7일"이 월 경계를 넘을 수 있어 지난달까지 읽는다. 그 이전 달 기록은 메모리에 올리지 않으며, 이번 변경에서는 쓰지도 않는다. 로드되지 않은 달에 판정이 들어갈 일은 없다(판정일 = 세션 날짜 = 이번 달 또는 자정 경과 시 지난달).
6. **세션은 순수 상태 전이로 둔다(`domain/session.ts`).** 상태: `{ date, order: cardRef[], index, flipped, firstGrades: Record<cardId, Grade>, retryQueued: Set 대신 배열 }`. 동작: `startSession(queue, date)`, `flip`, `judge(grade)` → `{ session, apply?: { cardId, deckId, grade } }`. `apply`가 있을 때만 화면이 `card/review`를 디스패치한다. 첫 판정이 기억 못 함이면 `order` 끝에 같은 카드를 1회 덧붙인다. 진행 표시는 `index + 1 / order.length`. 요약 계산(`summarize(session, contentState)`)도 같은 모듈에 둔다.
   - 대안: 세션 상태를 전역 리듀서에 둔다 → 기각(세션은 화면 수명과 같고 저장 대상이 아니다).
7. **복습 큐(`domain/queue.ts`)는 `buildQueue(state, today, { deckId?, limit = 100 })` → `{ cards: { cardId, deckId }[], overflow }`.** 정렬 키는 `(dueDate, createdAt)`.
8. **판정 즉시 저장은 Provider에서 처리한다.** Provider가 `dispatch`를 감싸 `card/review` 액션 뒤에는 변경 키를 큐에 넣은 다음 `flush()`를 호출한다. 다른 액션은 기존처럼 지연 저장. 저장 큐 자체는 바꾸지 않는다.
   - 구현: `dispatch` 래퍼가 액션 종류를 기록하고, 상태 반영 effect에서 변경 키를 넣은 뒤 표시가 있으면 `flush()`.
9. **`loadContent`·`diffContent`의 기존 테스트는 유지하고 로그 케이스를 추가한다.** `persistence.test.ts` 왕복 테스트에 판정 → 재로드 시 로그·일정 유지 검증을 추가한다.

## Risks / Trade-offs

- [지난달 이전 로그는 메모리에 없다] → 이번 변경에서 쓰지 않는다. 통계 범위가 넓어지면(F9 확장) 로드 범위를 늘린다.
- [로그 월 키가 무한히 늘어난다] → 카드 1,000장·하루 100판정 기준 월 수백 KB 수준(기획서 7.6 가정). 보존 정책은 출시 후 검토.
- [판정마다 즉시 저장해 브릿지 호출이 늘어난다] → 판정은 사용자 탭 단위(초 단위)라 과도 호출 기준(반복문·타이머 중복 호출)에 해당하지 않는다. 연타는 세션 화면에서 잠근다(day3-study-session).
- [스케줄러를 리듀서가 직접 참조한다] → 알고리즘 교체 시 리듀서 한 곳만 바뀐다. 카드에 algorithmId·version이 남으므로 교체 후에도 판별 가능하다.
