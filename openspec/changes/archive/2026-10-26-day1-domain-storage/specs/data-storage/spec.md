# Spec Delta

## Purpose

복습큐의 모든 학습 데이터를 기기 로컬 저장소에 문자열로 저장·조회하는 방법과 키 체계, 그리고 앱 설치 단위 메타데이터(Meta)의 초기화·영속 규칙을 정의한다.

## ADDED Requirements

### Requirement: 여러 키 일괄 조회
시스템은 키 목록을 받아 각 키의 저장 문자열을 키별로 돌려주어야 한다(SHALL). 저장되지 않은 키의 값은 `null`이어야 한다. 반환 결과에는 요청한 모든 키가 포함되어야 한다.

#### Scenario: 일부 키만 저장된 상태에서 조회
- **WHEN** `bq:meta`만 저장된 상태에서 `bq:meta`와 `bq:subjects`를 함께 조회한다
- **THEN** `bq:meta`는 저장된 문자열을, `bq:subjects`는 `null`을 돌려준다

#### Scenario: 일괄 조회를 지원하지 않는 토스 앱
- **WHEN** 토스 앱이 일괄 조회 API를 지원하지 않는 버전에서 여러 키를 조회한다
- **THEN** 키별 단건 조회 결과를 모아 일괄 조회와 같은 형태로 돌려준다

### Requirement: 여러 키 일괄 저장
시스템은 키와 문자열 값의 묶음을 받아 모두 저장해야 한다(SHALL). 저장이 실패하면 호출자에게 실패를 알려야 하며(MUST), 실패를 성공으로 보고해서는 안 된다.

#### Scenario: 저장 후 재조회
- **WHEN** `bq:subjects`와 `bq:decks`를 함께 저장한 뒤 같은 키를 조회한다
- **THEN** 저장한 문자열이 그대로 돌아온다

#### Scenario: 일괄 저장을 지원하지 않는 토스 앱
- **WHEN** 토스 앱이 일괄 저장 API를 지원하지 않는 버전에서 여러 키를 저장한다
- **THEN** 키별 단건 저장으로 모든 키를 저장한다

#### Scenario: 저장 실패
- **WHEN** 저장소가 쓰기 오류를 반환한다
- **THEN** 저장 호출은 오류로 끝나 호출자가 실패를 처리할 수 있다

### Requirement: 키 삭제와 전체 삭제
시스템은 단일 키를 삭제하는 기능과 앱의 저장 데이터를 전부 삭제하는 기능을 제공해야 한다(SHALL). 삭제한 키를 조회하면 `null`이어야 한다.

#### Scenario: 단일 키 삭제
- **WHEN** 저장된 `bq:decks`를 삭제한 뒤 조회한다
- **THEN** `null`을 돌려준다

#### Scenario: 전체 삭제
- **WHEN** 여러 키가 저장된 상태에서 전체 삭제한 뒤 그 키들을 조회한다
- **THEN** 모든 키가 `null`을 돌려준다

### Requirement: 저장 키 체계
시스템은 모든 저장 키에 `bq:` 접두사를 붙이고 다음 형식을 따라야 한다(SHALL): `bq:meta`, `bq:subjects`, `bq:decks`, 덱별 카드 `bq:cards:{deckId}`, 월별 리뷰 로그 `bq:logs:{YYYY-MM}`, 직전 정상본 `bq:backup:last`.

#### Scenario: 덱별 카드 키
- **WHEN** deckId가 `d1`인 덱의 카드 키를 만든다
- **THEN** 키는 `bq:cards:d1`이다

#### Scenario: 월별 로그 키
- **WHEN** 날짜 `2026-10-26`의 리뷰 로그 키를 만든다
- **THEN** 키는 `bq:logs:2026-10`이다

### Requirement: 최초 실행 시 Meta 생성
`bq:meta`가 없을 때 앱이 시작되면, 시스템은 `schemaVersion` 1, 기기 로컬 날짜 기준 오늘(`YYYY-MM-DD`)의 `lastOpenedDate`, 새로 생성한 `installId`를 가진 Meta를 만들어 `bq:meta`에 JSON 문자열로 저장해야 한다(SHALL).

#### Scenario: 빈 저장소에서 시작
- **WHEN** 저장소가 비어 있는 상태에서 2026-10-26에 앱이 시작된다
- **THEN** `bq:meta`에 `schemaVersion` 1, `lastOpenedDate` `2026-10-26`, 비어 있지 않은 `installId`가 저장된다

### Requirement: 재실행 시 Meta 유지
`bq:meta`가 이미 있으면, 시스템은 앱 시작 시 저장된 Meta를 그대로 불러와야 하며(SHALL) 새 `installId`를 만들거나 기존 값을 덮어써서는 안 된다(MUST NOT).

#### Scenario: 앱 재실행
- **WHEN** 첫 실행으로 Meta가 저장된 뒤 앱을 다시 시작한다
- **THEN** 첫 실행 때와 같은 `installId`를 가진 Meta를 불러온다

### Requirement: 고유 식별자 생성
시스템은 데이터 항목과 설치 식별자에 쓸 비어 있지 않은 문자열 id를 생성해야 한다(SHALL). 플랫폼 표준 UUID 생성기를 쓸 수 없는 환경에서도 id를 생성해야 한다(MUST).

#### Scenario: 연속 생성
- **WHEN** id를 연속으로 여러 번 생성한다
- **THEN** 생성된 id는 모두 비어 있지 않고 서로 다르다

#### Scenario: UUID 생성기 미지원 환경
- **WHEN** 플랫폼 표준 UUID 생성기를 쓸 수 없는 환경에서 id를 생성한다
- **THEN** 대체 방식으로 비어 있지 않은 id를 돌려준다
