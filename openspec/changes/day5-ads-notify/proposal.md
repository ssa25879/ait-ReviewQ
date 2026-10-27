# Proposal

## Why

기획서는 배너 광고(F14)와 동의 기반 복습 알림(F15)을 "코드는 MVP 기간에 구현하고, 콘솔 승인이 끝나면 켠다"는 조건부 기능으로 정했다(4.3·9.4·10장). Day 5 완료 조건은 "플래그 off 상태에서 광고·알림 UI가 노출되지 않는다"이다. Day 6 실기기 테스트(테스트 ID)와 출시 직전 결정 게이트(10.6)에서 바로 켜 볼 수 있도록, 지금 플래그 뒤에 구현해 둔다.

## What Changes

- **기능 플래그**: `ADS_ENABLED`·`NOTIFICATION_ENABLED`를 빌드 환경 변수로 받고 기본값은 off다. off이면 광고·알림 UI를 그리지 않고 관련 SDK도 호출하지 않는다.
- **배너 광고 영역**: 과목·덱 목록의 스크롤 하단과 학습 완료 화면의 결과 아래에만 배너 1개를 둔다. 운영 광고 그룹 ID가 주입되지 않은 빌드는 테스트 ID(`ait-ad-test-banner-id`)를 쓴다. 운영 ID는 저장소에 넣지 않고 로컬 환경 파일로만 주입한다. 미지원 기기·광고 없음·렌더 실패에서는 영역을 남기지 않는다.
- **복습 알림 동의**: 학습 완료 화면에 "복습 알림 받기" 보조 버튼을 둔다(플래그 on, 기기 지원, 템플릿 코드 설정, 동의 기록 없음일 때만). 동의 결과를 Meta에 저장하고, 응답한 뒤에는 다시 묻지 않는다.
- **Meta 버전 올림**: Meta에 `notification` 필드를 추가하고 `schemaVersion`을 2로 올린다. 기존 v1 Meta는 필드를 비운 채 버전만 올린다.
- **Meta 저장 단일화**: 마지막으로 연 날 갱신과 알림 동의 저장이 서로의 값을 덮어쓰지 않도록 Meta 쓰기를 한 곳으로 모은다.

범위 밖: 설정 화면과 거부 후 재요청 경로(9.4.3), 운영 광고 그룹 ID 발급·교체와 플래그 결정(Day 6~7 게이트), 실기기 광고·알림 확인(Day 6), 알림 소재·캠페인 등록(콘솔 작업), 개인화 알림(F17).

## Capabilities

### New Capabilities
- `banner-ads`: 광고 기능 플래그, 테스트 ID 사용, 배치 위치와 개수, 미지원·실패 시 처리, 광고 영역 수명주기.
- `review-notification`: 알림 기능 플래그, 동의 요청 버튼 노출 조건, 동의 결과 기록과 재요청 정책.

### Modified Capabilities
- `data-storage`: "최초 실행 시 Meta 생성"의 `schemaVersion`을 2로, "재실행 시 Meta 유지"에 버전 올림 예외를 추가하고, Meta 버전 올림 요구사항을 더한다.

## Impact

- 코드: `reviewq/src/config/flags.ts`(신설), `reviewq/src/components/AdSlot.tsx`·`NotificationOptIn.tsx`(신설), `reviewq/src/app/metaStore.ts`(신설), `reviewq/src/app/today.tsx`(Meta 쓰기 위임), `reviewq/src/infra/storage/meta.ts`(마이그레이션·동의 저장), `reviewq/src/infra/storage/validate.ts`(Meta v2 허용), `reviewq/src/domain/model.ts`, `reviewq/src/screens/SubjectList/`, `reviewq/src/screens/Study/StudySession.tsx`, `reviewq/src/screens/messages.ts`, `reviewq/.env.example`(신설).
- 저장: `bq:meta`의 `schemaVersion` 1 → 2, `notification` 필드 추가.
- 선행 조건: `day5-storage-recovery`(형식 검증·`loadApp`)를 구현·아카이브한 뒤 진행한다.
- 의존성 추가 없음(`@apps-in-toss/web-framework`의 `TossAds`·`Notification` 사용).
