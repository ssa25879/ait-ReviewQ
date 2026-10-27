# Spec Delta

## MODIFIED Requirements

### Requirement: 재실행 시 Meta 유지
`bq:meta`가 이미 있으면, 시스템은 앱 시작 시 저장된 Meta를 불러와야 하며(SHALL) 새 `installId`를 만들거나 `installId`·`schemaVersion`을 덮어써서는 안 된다(MUST NOT). `lastOpenedDate`는 날짜 규칙(시계 되돌림 판정)에 따라서만 갱신한다.

#### Scenario: 앱 재실행
- **WHEN** 첫 실행으로 Meta가 저장된 뒤 앱을 다시 시작한다
- **THEN** 첫 실행 때와 같은 `installId`를 가진 Meta를 불러온다

#### Scenario: 다음 날 재실행
- **WHEN** 2026-10-25에 저장된 Meta가 있는 상태에서 2026-10-26에 앱을 시작한다
- **THEN** `bq:meta`의 `installId`·`schemaVersion`은 그대로이고 `lastOpenedDate`는 `2026-10-26`으로 저장된다
