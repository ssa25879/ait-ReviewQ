# Proposal

## Why

지금은 저장 값 하나만 손상돼도 앱이 "데이터를 불러오지 못했어요"에서 멈추고, 사용자가 할 수 있는 동작이 없다(막다른 화면). 저장이 실패해도 콘솔 로그만 남고 사용자는 모른다. 기획서 Day 5 완료 조건("12장 데이터 손실 시나리오 통과")의 D-03(저장 실패)·D-04(손상된 JSON)와 7.4·7.5·7.7의 복구 정책을 화면과 규칙으로 고정해야 한다.

## What Changes

- **저장 데이터 형식 검증**: 앱 시작 때 과목·덱·카드·로그·Meta 키를 JSON 파싱뿐 아니라 필수 필드·타입·날짜 형식·길이까지 검사한다. 하나라도 어긋나면 그 키를 손상으로 보고 덮어쓰지 않는다.
- **마지막 정상 백업(`bq:backup:last`)**: 로드와 검증이 모두 성공했을 때만 하루 한 번 과목·덱·카드를 백업한다.
- **복구 화면**: 손상이 있으면 막다른 안내 대신 복구 화면을 보여 준다. 선택지는 "백업으로 복구", "손상 항목 빼고 열기", "다시 시도"다. 어느 쪽이든 손상된 원본 값은 먼저 격리 키(`bq:quarantine:*`)로 옮겨 보존한다.
- **저장소 읽기 실패 구분**: 저장소 호출 자체가 실패한 경우(데이터 접근 실패)는 손상과 구분해 "다시 시도"만 제공한다.
- **저장 실패 재시도와 안내**: 저장이 실패하면 최대 3회까지 간격을 늘려 다시 시도하고, 최종 실패 시 화면 안에 안내와 "다시 시도"를 보여 준다. 메모리의 변경은 유지하고, 다음 변경 때도 다시 저장한다.

범위 밖: 백업 내보내기·가져오기(F10·F13), 설정 화면과 전체 삭제, 실행 취소(F11), 덱·카드 간 참조 무결성 보정(고아 카드 정리), 요소 단위 부분 복구(손상 키 안의 정상 항목 살리기), 광고·알림(별도 change `day5-ads-notify`).

## Capabilities

### New Capabilities
- `data-recovery`: 저장 데이터 형식 검증, 마지막 정상 백업, 손상 시 복구 화면과 선택지(백업 복구·격리 후 열기·다시 시도), 저장소 읽기 실패 처리, 저장 실패 재시도와 화면 안내.

### Modified Capabilities
- `data-storage`: "앱 데이터 로드"·"리뷰 로그 로드"에서 손상 판정을 JSON 파싱 실패에서 형식 검증 실패까지 넓히고, 실패 결과에 손상 키 목록을 담는다.
- `content-screens`: "로딩과 로드 실패 표시"의 실패 안내를 복구 화면으로 바꾼다(편집 동작은 여전히 막는다).

## Impact

- 코드: `reviewq/src/infra/storage/validate.ts`(신설), `loadContent.ts`·`meta.ts`(손상 결과 반환), `backup.ts`·`recovery.ts`(신설), `saveQueue.ts`(재시도·상태 알림), `reviewq/src/app/bootstrap.ts`·`store.tsx`(로드 결과·저장 상태), `reviewq/src/screens/Recovery/`(신설), `reviewq/src/components/SaveErrorNotice`(신설), `reviewq/src/App.tsx`, `reviewq/src/screens/messages.ts`.
- 저장: 새 키 `bq:backup:last`, `bq:quarantine:{원래 키}`. 기존 키 형식·`schemaVersion`은 바꾸지 않는다.
- 의존성 추가 없음.
