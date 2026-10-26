# Proposal

## Why

기획서 11장 Day 2의 완료 조건은 "재실행 후 데이터가 유지되고 연쇄 삭제가 동작한다"이다. Day 1에서 타입·저장소 어댑터·Meta 초기화를 고정했지만, 과목·덱·카드를 만들고 고치고 지우는 규칙과 변경을 저장소에 반영하는 경로가 없다. 화면(day2-crud-screens)보다 먼저 이 데이터 계층을 순수 로직과 단위 테스트로 고정해 두어야 화면은 표시와 입력에만 집중할 수 있다.

## What Changes

- 과목·덱·카드 CRUD를 상태 전이(리듀서)로 구현한다(기획서 F1~F3).
  - 과목: 생성, 이름 변경, 삭제. 삭제하면 하위 덱과 카드도 삭제한다.
  - 덱: 생성, 이름 변경, 다른 과목으로 이동, 삭제. 삭제하면 하위 카드도 삭제한다.
  - 카드: 생성(신규 일정 부여), 질문·정답 수정, 삭제.
- 입력 제한 검증(기획서 4.1): 이름 1~30자, 질문·정답 1~500자. 앞뒤 공백을 제거한 뒤 검사한다.
- 앱 시작 시 `bq:subjects`·`bq:decks`와 덱별 `bq:cards:{deckId}`를 불러온다.
- 변경된 키만 디바운스(400ms)로 모아 일괄 저장하고, 삭제된 덱의 카드 키는 저장소에서 지운다.
- 앱이 백그라운드로 전환되면(`visibilitychange` hidden) 대기 중인 저장을 즉시 실행한다.
- 저장이 실패하면 대기 중인 변경을 버리지 않고 다음 저장 때 다시 쓴다. 재시도 정책·실패 안내 UI는 Day 5로 미룬다.
- React Context + useReducer 기반 전역 Provider를 두고 `App`을 감싼다. 화면은 바꾸지 않는다(스타터 화면 유지).

범위 밖: 화면·라우터(day2-crud-screens), 삭제 확인·실행 취소(F11), 재시도·실패 안내·손상 복구·형식 검증(Day 5), 리뷰 로그 기록과 정리(Day 3), 같은 과목 내 덱 이름 중복 경고(화면 단계).

## Capabilities

### New Capabilities
- `study-content`: 과목·덱·카드의 생성·수정·이동·삭제 규칙, 입력 제한, 연쇄 삭제, 신규 카드의 초기 일정.

### Modified Capabilities
- `data-storage`: 앱 데이터 로드, 변경 키 디바운스 저장, 삭제된 키 정리, 백그라운드 전환 시 즉시 저장, 저장 실패 시 변경 보존 요구사항을 추가한다.

## Impact

- 코드: `reviewq/src/domain/`(검증·CRUD 리듀서), `reviewq/src/infra/storage/`(로드·변경 키 계산·저장 큐), `reviewq/src/app/`(Provider) 신설, `reviewq/src/App.tsx`·`main.tsx`에서 Provider 연결.
- 의존성: 추가 없음.
- 외부 API: `@apps-in-toss/web-framework` `Storage`(Day 1 어댑터 경유), 브라우저 `visibilitychange` 이벤트.
- 사용자에게 보이는 화면 변화는 없다.
