# Design

## Context

- 실기기(Android) 확인 결과: `File.saveBase64`는 기기에 저장하지 않고 공유 시트를 연다. 카카오톡 등으로 보낸 `.json` 파일은 열기·복사가 어려웠다. 가져오기의 "파일 선택" 창은 열렸다.
- SDK `Share.sendMessage({ message })`는 네이티브 공유 시트로 글자를 보내며 권한이 필요 없다(타입 정의 확인, 지원 여부 함수는 없음). devtools 모의는 `navigator.share`가 있으면 그것을, 없으면 콘솔 로그를 쓴다.
- 내보내기 문서(`ExportDoc`)·검증(`parseImport`)·교체(`replaceAll`)는 이미 있다. 이번 change는 문서를 글자로 싸고 푸는 층과 화면만 바꾼다.
- 카드 22장 문서는 JSON 약 8KB다. 메신저 한 메시지의 글자 수 제한은 확인하지 못했다.

## Goals / Non-Goals

**Goals:**
- 메신저 메시지 하나를 복사·붙여넣기 하는 것만으로 백업과 복원이 끝나게 한다.
- 기존 JSON 파일·붙여넣기 경로와 호환을 유지한다.

**Non-Goals:**
- 긴 코드를 여러 메시지로 나누기, 클립보드 읽기, 서버 동기화.

## Decisions

1. **코드 형식: `RQB1.` + base64url(gzip(compact JSON)) (`infra/storage/backupCode.ts`).**
   - `encodeBackupCode(doc)`: `JSON.stringify(doc)`(들여쓰기 없음) → UTF-8 → `CompressionStream('gzip')` → base64url(패딩 없음). `CompressionStream`이 없으면 압축 없이 `RQB0.` + base64url(UTF-8)로 만든다.
   - `extractBackupCode(text)`: 글 안에서 `/RQB[01]\.[A-Za-z0-9_-]+/`를 찾는다. 공유 메시지 전체나 줄바꿈이 끼어든 붙여넣기도 받도록, 찾기 전에 공백·줄바꿈을 지운 글에서도 한 번 더 찾는다.
   - `decodeBackupCode(code)`: 역순으로 풀어 JSON 글을 돌려준다. base64 오류·압축 해제 오류(잘린 코드)는 예외.
   - 대안: 압축 없이 JSON 그대로 공유 → 기각. 길이가 3~5배 길고 따옴표·줄바꿈이 메신저에서 바뀔 수 있다. 대안: LZ-string 등 라이브러리 → 기각. 브라우저 내장 API로 충분하고 의존성을 늘리지 않는다.
2. **가져오기 입력 처리(`importData.ts`의 `parseImportInput(text)`, 비동기).** 글에 코드가 있으면 풀어서 `parseImport`에 넣고, 풀지 못하면 새 실패 이유 `badCode`. 코드가 없으면 기존처럼 `parseImport(text)`. 파일 선택도 같은 함수를 쓴다(파일에 코드가 들어 있어도 받는다).
3. **화면(`Settings.tsx` 백업 섹션).**
   - 기본 버튼 "백업 코드 공유": 저장 대기 변경 저장 → 문서 생성·검증 → 코드 생성 → `Share.sendMessage({ message: 안내 문구 + 빈 줄 + 코드 })`. 결과와 관계없이 코드를 읽기 전용 입력란에 보여 주고 "코드 복사" 버튼을 둔다. 공유가 reject되면 실패 안내를 더한다. ref로 연타를 막는다.
   - "코드 복사": `navigator.clipboard.writeText` → 실패하면 입력란을 선택해 `document.execCommand('copy')` → 그것도 실패하면 "길게 눌러 복사" 안내. SDK `Clipboard.setText`는 권한 추가가 필요해 쓰지 않는다.
   - 보조 버튼 "파일로 저장": 기존 동작 그대로(이름만 변경). 안내 문구는 "파일 저장을 요청했어요"로 바꾼다(기기에 따라 공유 시트로 열리므로).
   - 가져오기 입력란 라벨을 "백업 코드 또는 백업 내용 붙여넣기"로 바꾸고, 붙여넣기 칸을 파일 선택보다 위에 둔다(주 경로가 붙여넣기이므로).
4. **검증.**
   - 단위 테스트: 인코딩·해독 왕복(한글·특수문자, 압축·비압축 두 형식), 메시지 안 코드 찾기(앞뒤 안내 문구·줄바꿈 낀 코드), 잘린 코드 → 예외, `parseImportInput`(코드·JSON·잘린 코드 `badCode`).
   - CDP(`handoff/e2e/import.mjs`에 추가, `settings.mjs` 갱신): `navigator.share`를 가로채 공유 메시지에 코드 포함·1회, 화면 코드 표시, 공유 실패 시 안내와 코드, 코드 복사(클립보드 권한 부여 후 내용 확인), 공유 메시지 전체 붙여넣기 → 요약 → 가져오기, 잘린 코드 안내, "파일로 저장" 기존 검사 유지.

## Risks / Trade-offs

- [메신저의 한 메시지 글자 수 제한을 넘으면 코드가 잘린다] → 압축으로 길이를 줄이고, 잘린 코드는 `badCode`로 알려 엉뚱한 데이터가 들어가지 않게 한다. 실기기에서 카드 수백 장 코드가 카카오톡 나와의 채팅으로 온전히 전달되는지 확인한다. 넘치면 파일 경로(드라이브 저장 → 파일 선택)를 쓴다.
- [`CompressionStream`이 없는 오래된 WebView] → 압축 없는 `RQB0` 코드로 대체한다. 해독 쪽에 `DecompressionStream`이 없으면 `RQB1` 코드를 풀 수 없으므로 `badCode`로 알린다.
- [WebView에서 `navigator.clipboard`·`execCommand('copy')`가 모두 막힐 수 있다] → 코드를 화면에 항상 보여 주고 길게 눌러 복사하도록 안내한다. 공유 시트가 주 경로라 복사는 보조다.

## Migration Plan

- 저장 형식 변경 없음. 기존 JSON 백업 파일·붙여넣기는 그대로 가져올 수 있다.
