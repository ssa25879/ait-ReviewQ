# Proposal

## Why

실기기(Android)에서 "백업 내보내기"의 파일 저장(`File.saveBase64`)은 기기에 저장되지 않고 공유 시트(구글 드라이브·카카오톡 등)로만 나갔다. 그렇게 보낸 `.json` 파일은 다시 열거나 앱에 넣기 어려워, 가져오기까지 이어지는 백업 흐름을 실제로 쓸 수 없었다. 파일 대신 메신저 메시지로 주고받을 수 있는 글자 형태의 백업이 필요하다.

## What Changes

- **백업 코드 공유**: 설정의 백업 섹션에서 "백업 코드 공유"를 기본 동작으로 둔다. 내보내기 문서를 압축해 한 덩어리 글자(백업 코드)로 만들고, 안내 문구와 함께 공유 시트(`Share.sendMessage`, 권한 불필요)로 보낸다(예: 카카오톡 나와의 채팅). 화면에도 코드와 "코드 복사" 동작을 보여 준다.
- **백업 코드로 가져오기**: 가져오기 입력란에 백업 코드(또는 코드가 든 메시지 전체)를 붙여넣으면 코드를 찾아 풀고, 기존과 같은 검증·요약·2단계 확인으로 가져온다. 기존 JSON 붙여넣기와 파일 선택도 그대로 받는다.
- **파일 저장은 보조로**: 기존 "백업 내보내기"는 "파일로 저장"으로 이름을 바꿔 보조 동작으로 남긴다(실기기에서 파일 선택 창이 열리는 것을 확인했으므로 드라이브 등에 저장한 파일은 가져올 수 있다).

범위 밖: 메신저별 글자 수 제한 대응(나눠 보내기), 클립보드 읽기 API(권한 필요), 서버 동기화(v2.0).

## Capabilities

### New Capabilities
(없음)

### Modified Capabilities
- `data-export`: 백업 코드 공유·코드 복사 요구사항을 더하고, 파일 저장을 보조 동작 "파일로 저장"으로 바꾼다.
- `data-import`: 입력에 백업 코드를 받고, 잘못된 코드의 안내를 더한다.

## Impact

- 코드: `reviewq/src/infra/storage/backupCode.ts`(신설: 압축·base64url 인코딩과 해독), `reviewq/src/infra/storage/importData.ts`(코드 입력 처리), `reviewq/src/screens/Settings/Settings.tsx`·`Settings.module.css`, `reviewq/src/screens/messages.ts`.
- SDK: `Share.sendMessage`(권한 없음). 브라우저 API `CompressionStream`·`DecompressionStream`(gzip), 없으면 압축 없는 코드로 대체.
- 저장 형식·권한·의존성 변경 없음.
