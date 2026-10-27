# Proposal

## Why

기획서는 설정 화면에 백업 내보내기(F10), 전체 삭제, '기기에만 저장됨' 고지를 두기로 했다(5.2·7.7). 알림 동의를 거부한 사용자가 다시 요청하는 유일한 경로도 설정이다(9.4.3, N-06). 지금은 설정 화면이 없다. 그래서 거부한 사용자가 다시 동의할 길이 없어 알림 플래그를 켤 수 없고(day5-ads-notify Risks), 기기 변경·재설치 때 데이터를 지킬 방법도 없다. Day 6 실기기 검증에서 함께 확인할 수 있도록 지금 만든다.

## What Changes

- **설정 화면**: 경로 `#/settings`를 추가하고, 홈의 "통계" 행 아래에 "설정" 진입 행을 둔다.
- **저장 위치 고지**: 데이터가 이 기기에만 저장된다는 점과, 토스 앱을 지우거나 기기를 바꾸면 사라진다는 점을 설정 화면 맨 위에 항상 보여 준다. 백업 내보내기를 권한다.
- **백업 내보내기(F10)**: 과목·덱·카드·판정 기록 전체를 형식 버전이 붙은 JSON 파일 하나로 만들어 기기에 저장한다(SDK 파일 저장, 권한 추가 없음). 내보낸 내용은 앱의 저장 형식 검증을 통과해야 한다. 파일 저장을 지원하지 않거나 저장에 실패하면 같은 JSON을 화면에 보여 주어 직접 복사할 수 있게 한다.
- **전체 삭제**: 2단계 확인 뒤 이 앱의 저장 데이터를 모두 지운다(과목·덱·카드·기록·Meta·자동 백업·격리 원본). 지운 뒤 첫 실행과 같은 빈 상태로 홈을 연다. 저장 대기 중인 변경이 삭제 뒤에 다시 쓰이지 않게 한다.
- **알림 재요청**: 알림 플래그가 켜져 있고 기기가 지원할 때만 설정에 '복습 알림' 항목을 보여 준다. 현재 상태(받는 중·받지 않음·아직 정하지 않음)를 보여 주고, 받는 중이 아니면 사용자가 눌러서 다시 요청할 수 있다. 학습 완료 화면은 기록이 생긴 뒤 계속 다시 묻지 않는다.

범위 밖: 백업 가져오기(F13, v1.1), 마지막 내보내기 날짜 표시(Meta 형식 변경 필요), 앱 정보·버전 표시, 클립보드 복사 API(권한 추가 필요), 실행 취소(F11), 추가 연습(F12), 알림 수신 철회(토스 앱 설정에서 한다), 실기기 파일 저장 위치 확인(Day 6).

## Capabilities

### New Capabilities
- `settings-screen`: 설정 진입, 저장 위치 고지, 전체 삭제(2단계 확인·삭제 후 상태), 알림 재요청 항목의 노출 조건과 동작.
- `data-export`: 내보내기 파일의 내용·형식 버전·형식 검증, 파일 저장과 대체 표시, 실패 처리.

### Modified Capabilities
- `review-notification`: "동의 요청 버튼 노출"에서 설정의 '복습 알림' 항목을 사용자가 눌러 요청하는 경우를 예외로 허용하고, "동의 결과 기록"에서 기록 뒤에는 설정에서만 다시 요청할 수 있다고 정한다.

## Impact

- 코드: `reviewq/src/app/router.ts`(경로 `settings`), `reviewq/src/App.tsx`, `reviewq/src/screens/Settings/`(신설), `reviewq/src/screens/Home/Home.tsx`(진입 행), `reviewq/src/screens/messages.ts`(`SETTINGS`·`EXPORT`), `reviewq/src/infra/storage/exportData.ts`(신설), `reviewq/src/app/bootstrap.ts`·`store.tsx`(전체 삭제 후 다시 불러오기, 저장 큐 비우기), `reviewq/src/infra/storage/saveQueue.ts`(대기 변경 버리기), `reviewq/src/components/NotificationOptIn.tsx`(동의 요청 로직을 설정과 함께 쓰도록 분리).
- 저장: 형식 변경 없음. 전체 삭제는 `clearItems`로 이 앱의 저장소를 비운다.
- SDK: `File.saveBase64`(토스 앱 Android 5.218.0·iOS 5.216.0 이상, 권한 불필요), `Notification.requestAgreement`(기존).
- 의존성 추가 없음. `apps-in-toss.config.ts`의 `permissions` 변경 없음.
