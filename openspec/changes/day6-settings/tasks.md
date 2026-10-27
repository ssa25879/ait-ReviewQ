# Tasks

모든 경로는 `reviewq/` 기준이다. 화면 동작 검증은 CDP 스크립트(헤드리스 Edge, PowerShell에서 node 실행, 출력 폴더는 절대 경로)로 하고, 알림 on 확인은 별도 포트의 dev 서버를 `VITE_NOTIFICATION_ENABLED=true`·`VITE_NOTIFICATION_TEMPLATE_CODE=test`로 띄워 한다. 파일 저장은 devtools 모의(`saveBase64Data mock`)를 쓰고, 호출 인자는 함수 래핑으로 캡처한다.

## 1. 경로와 진입

- [x] 1.1 `app/router.ts`에 `settings` 경로(`#/settings`, seed [home])를 더하고 `App.tsx`에 화면을 연결한다. 홈의 "통계" 행 아래에 "설정" 행을 두고 문구는 `messages.ts`의 `SETTINGS`에 둔다(design 결정 1). 검증: `router.test.ts`에 parse·format·seed 케이스를 추가하고, CDP로 홈 → 설정 → 뒤로가기 = 홈, `#/settings` 직접 열기 → 뒤로가기 = 홈, 새로고침 시 설정 유지를 확인한다

## 2. 설정 화면과 저장 위치 고지

- [x] 2.1 `screens/Settings/Settings.tsx`(+CSS 모듈)를 만들어 고지 블록·백업·복습 알림·데이터 섹션 틀을 둔다(design 결정 2). 검증: CDP로 카드 0장에서도 고지 문구가 보임, 본문 글자 15px 이상·터치 44px 이상·광고 영역 없음을 확인한다

## 3. 백업 내보내기

- [x] 3.1 `infra/storage/exportData.ts`에 `buildExport`(월 범위 계산 포함)·`validateExport`·base64 인코딩을 만든다(design 결정 3·4). 검증: 단위 테스트로 과목·덱·카드·두 달치 기록 포함, 알림 기록·`installId` 제외, 가장 이른 `createdAt` 달부터 이번 달까지 키 계산(연도 경계 포함), 빈 데이터 문서가 유효, 손상된 달이 있으면 실패, 한글 JSON의 base64 왕복이 같음을 확인한다
- [x] 3.2 설정 화면에 "백업 내보내기"를 연결한다: `saveQueue.flush()` 후 문서 생성·검증, `File.saveBase64` 호출, 미지원·실패 시 읽기 전용 텍스트(design 결정 4). 검증: CDP로 파일명 `reviewq-backup-YYYY-MM-DD.json`·MIME `application/json`·디코딩한 내용이 형식 검증 통과, 편집 직후 내보내면 고친 값 포함, 연타 시 1회 호출, 미지원 → 호출 0회·텍스트 표시, reject → 실패 안내·텍스트 표시·저장소 값 불변을 확인한다

## 4. 전체 삭제

- [x] 4.1 `infra/storage/saveQueue.ts`에 `discard()`를 더한다(design 결정 5). 검증: 단위 테스트로 대기 중 변경이 `discard` 뒤 저장되지 않음, 재시도 타이머 취소, 실행 중 쓰기가 끝날 때까지 기다림, 상태가 ok로 돌아옴을 확인하고 기존 `saveQueue` 테스트가 통과한다
- [x] 4.2 `store.tsx`에 `clearAllData()`(discard → `clearItems` → `reloadApp`)를 두고 설정의 "모든 데이터 삭제"에 2단계 `Dialog` 확인을 연결한다(design 결정 5·6). 검증: CDP로 1단계 취소·2단계 취소 시 저장소 불변, 실행 후 홈 첫 사용 안내·`bq:` 키가 새 `bq:meta`(알림 기록 없음)만 남음, 카드 편집 직후 삭제 후 1초 기다려도 카드 키 없음, `clearItems` 실패 주입 시 실패 안내·다시 시도·막다른 화면 없음, 삭제 후 새로고침해도 빈 상태를 확인한다

## 5. 복습 알림 재요청

- [x] 5.1 `NotificationOptIn`의 요청·기록 로직을 `components/useNotificationAgreement.ts`로 옮기고 설정의 '복습 알림' 항목(상태 문구·"알림 받기")을 만든다(design 결정 7). 문구는 `messages.ts`의 `NOTIFY`에 더한다. 검증: CDP 기본 빌드로 항목 없음, 플래그 on 빌드로 항목 표시·설정 진입만으로 요청 0회, 지원 false → 항목 없음, 거부 기록 → "알림 받기" → 동의 시 기록 동의함·상태 받는 중(N-06), 거부 기록 → 다시 거부 시 `lastAskedAt` 갱신 후 학습 완료 화면에 버튼 없음, 요청 오류 → 기록 불변·실패 안내를 확인하고, 기존 `ads-notify.mjs`(39항목)가 그대로 통과한다

## 6. 통합 확인

- [x] 6.1 `npx tsc -b`·`npm run lint`·`npm test -- --run`·`npm run build`가 통과하고, 기존 CDP 스크립트(crud·review·study·home·stats·recovery·ads-notify)가 그대로 통과한다. 새 CDP 스크립트 `settings.mjs`를 `handoff/e2e/`에 둔다. `apps-in-toss.config.ts`의 `permissions`가 비어 있음을 확인한다. 설정 화면(기본·알림 on·내보내기 대체 텍스트) 캡처를 사용자에게 공유한다

## Workflow follow-up

- 리뷰 후 커밋·푸시하고 change를 archive한다.
- Day 6 실기기: 파일 저장 위치와 사용자가 찾을 수 있는지, 전체 삭제 후 재실행, 설정의 알림 재요청을 기획서 13.2 체크리스트와 함께 기록한다.
