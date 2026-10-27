# Spec Delta

## MODIFIED Requirements

### Requirement: 최초 실행 시 Meta 생성
`bq:meta`가 없을 때 앱이 시작되면, 시스템은 `schemaVersion` 2, 기기 로컬 날짜 기준 오늘(`YYYY-MM-DD`)의 `lastOpenedDate`, 새로 생성한 `installId`를 가지고 알림 동의 기록은 없는 Meta를 만들어 `bq:meta`에 JSON 문자열로 저장해야 한다(SHALL).

#### Scenario: 빈 저장소에서 시작
- **WHEN** 저장소가 비어 있는 상태에서 2026-10-26에 앱이 시작된다
- **THEN** `bq:meta`에 `schemaVersion` 2, `lastOpenedDate` `2026-10-26`, 비어 있지 않은 `installId`가 저장되고 `notification`은 없다

### Requirement: 재실행 시 Meta 유지
`bq:meta`가 이미 있으면, 시스템은 앱 시작 시 저장된 Meta를 불러와야 하며(SHALL) 새 `installId`를 만들거나 `installId`를 덮어써서는 안 된다(MUST NOT). `schemaVersion`은 Meta 버전 올림으로만 바뀐다. `lastOpenedDate`는 날짜 규칙(시계 되돌림 판정)에 따라서만, 알림 동의 기록은 동의 결과로만 갱신한다. 한 항목을 갱신할 때 다른 항목의 저장 값을 잃어서는 안 된다(MUST NOT).

#### Scenario: 앱 재실행
- **WHEN** 첫 실행으로 Meta가 저장된 뒤 앱을 다시 시작한다
- **THEN** 첫 실행 때와 같은 `installId`를 가진 Meta를 불러온다

#### Scenario: 다음 날 재실행
- **WHEN** 2026-10-25에 저장된 v2 Meta가 있는 상태에서 2026-10-26에 앱을 시작한다
- **THEN** `bq:meta`의 `installId`·`schemaVersion`은 그대로이고 `lastOpenedDate`는 `2026-10-26`으로 저장된다

#### Scenario: 동의 기록 후 날짜 갱신
- **WHEN** 알림 동의 기록이 저장된 뒤 다음 날 앱으로 돌아와 `lastOpenedDate`가 갱신된다
- **THEN** `bq:meta`에 알림 동의 기록과 새 `lastOpenedDate`가 함께 남아 있다

## ADDED Requirements

### Requirement: Meta 버전 올림
앱 시작 시 저장된 Meta의 `schemaVersion`이 현재 버전(2)보다 낮으면 시스템은 버전별 변환을 순서대로 적용해 현재 버전으로 올리고 `bq:meta`에 저장해야 한다(SHALL). v1 → v2 변환은 알림 동의 기록을 비운 채 버전만 올린다. 다른 키는 바꾸지 않는다.

#### Scenario: v1 Meta 올림 (D-05)
- **WHEN** `schemaVersion` 1 Meta와 과목·덱·카드가 저장된 상태에서 앱을 시작한다
- **THEN** `bq:meta`가 `schemaVersion` 2, 같은 `installId`, 알림 기록 없음으로 저장되고 과목·덱·카드는 그대로 보인다
