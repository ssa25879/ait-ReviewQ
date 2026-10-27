# Design

## Context

- 내보내기(`infra/storage/exportData.ts`)가 `ExportDoc`(`format`·`formatVersion`·`schemaVersion`·과목·덱·카드·월별 판정 기록)와 `validateExport`·`exportLogMonths`·`buildExport`를 이미 제공한다. 가져오기는 이 형식을 그대로 받는다.
- 전체 삭제(`store.tsx`의 `clearAll`)가 "저장 큐 비우기(`saveQueue.discard`) → 저장소 변경 → `reloadApp`" 순서와 실패 시 다시 읽기를 이미 갖췄다. 가져오기도 같은 틀을 쓴다.
- 저장소에는 키 목록 API가 없다. 지울 판정 기록 키는 지금 데이터의 생성 달 범위(`exportLogMonths`)로 계산한다.
- 손상 복구용 자동 백업 `bq:backup:last`는 과목·덱·카드만 담고, 그날 첫 정상 실행 때 갱신된다(`loadApp`).
- SDK에는 파일 선택 API가 없다(문서 검색 결과 `File.saveBase64`·`openPDFViewer`만 있음). HTML `<input type="file">`이 토스 WebView에서 열리는지는 문서에 근거가 없다.

## Goals / Non-Goals

**Goals:**
- 내보낸 파일 하나로 다른 기기·재설치 후 학습 상태(카드 일정·학습 기록)를 그대로 되살린다.
- 잘못된 파일이 저장소를 망가뜨리지 않게 하고, 교체 전 데이터를 잃지 않게 한다.

**Non-Goals:**
- 병합, 되돌리기 화면, CSV 등 다른 형식.

## Decisions

1. **해석·검사는 순수 함수 `parseImport(text)`로 둔다(`infra/storage/importData.ts`).**
   - 순서: JSON 파싱 실패 → `notJson`. `format`이 `reviewq-backup`이 아니면 → `invalid`. `formatVersion > EXPORT_FORMAT_VERSION` 또는 `schemaVersion > SCHEMA_VERSION` → `newer`. `validateExport` 실패 → `invalid`. 덱의 `subjectId`가 과목에 없거나, `cards`의 키가 덱에 없거나, 카드의 `deckId`가 키와 다르면 → `inconsistent`.
   - 통과하면 `{ ok: true, doc, summary: { subjects, decks, cards, logs, exportedAt } }`.
   - 버전 검사를 형식 검증보다 먼저 하는 이유: 새 버전 문서는 필드가 늘어 형식 검증에서 떨어질 수 있는데, 그때 "파일이 아니다"가 아니라 "업데이트하라"를 알려야 한다.
2. **교체는 `importBackup({ storage, doc, current, schemaVersion, today })`.**
   - ① 지금 데이터를 `buildExport`로 만들어 `bq:backup:beforeImport`에 저장한다. 실패하면 예외를 던져 아무것도 바꾸지 않는다.
   - ② 백업의 과목·덱·덱별 카드·월별 기록을 `setItems` 한 번으로 쓴다.
   - ③ 지금 데이터에만 있던 덱의 카드 키와, 지금 데이터의 기록 달 범위 중 백업에 없는 달의 기록 키를 지운다. 새 값을 먼저 쓰고 나서 지운다(중간에 실패해도 백업 내용은 다 들어가 있게).
   - ④ `bq:backup:last`를 백업 내용으로 갱신한다(복구 화면이 가져오기 이전 데이터로 되돌리지 않게).
   - Meta는 건드리지 않는다.
   - 대안: `clearItems` 후 쓰기 → 기각. Meta(설치 식별자·알림 동의)와 격리 원본까지 지워진다.
3. **`store.tsx`에 `replaceAll(doc)`을 둔다.** `clearAll`과 같은 순서다: `savedRef = null` → `saveQueue.discard()` → `importBackup`(현재 상태는 ref로 읽는다) → `reloadApp()`. 실패하면 `reloadApp()`으로 저장소 실제 상태를 다시 읽고 예외를 던진다.
4. **화면(`screens/Settings`의 `ImportSection`).**
   - 백업 섹션의 "백업 내보내기" 아래에 "백업 가져오기" 보조 버튼. 누르면 펼쳐진다: "파일 선택" 버튼(숨긴 `<input type="file" accept=".json,application/json">`를 누름), "또는 백업 내용 붙여넣기" 입력란과 "불러오기" 버튼.
   - 파일은 `file.text()`로 읽어 `parseImport`에 넣는다. 결과가 실패면 이유별 안내(`IMPORT` 문구), 성공이면 요약과 "이 백업으로 바꾸기"(위험 스타일) 버튼.
   - 2단계 확인은 전체 삭제와 같이 `ConfirmDialog`를 두 번 쓴다. 성공하면 `back()`으로 홈(설정 아래에는 항상 홈이 있다).
   - 진행 중에는 버튼을 비활성화하고 ref로 연타를 막는다.
5. **검증.**
   - 단위 테스트: `parseImport`(정상·notJson·invalid·newer·inconsistent 각 경우), `importBackup`(교체 후 키, 보관 키 내용, Meta 불변, 오래된 카드·기록 키 삭제, 보관 실패 시 무변경), 내보내기 → 가져오기 왕복이 같은 상태(D-06).
   - CDP(`handoff/e2e/import.mjs`): 붙여넣기 경로 전체 흐름, 파일 입력에 `DataTransfer`로 파일을 넣어 같은 흐름, 이유별 안내, 2단계 취소, 저장 대기 중 가져오기, 보관 실패 주입, 가져온 뒤 홈·통계 수치.

## Risks / Trade-offs

- [토스 WebView에서 파일 선택이 열리지 않을 수 있다] → 붙여넣기 입력란을 항상 함께 둔다. Day 6 실기기에서 파일 선택이 열리는지, 내보낸 파일이 선택 목록에 보이는지 확인한다.
- [큰 백업(카드 3,000장, 수백 KB)을 붙여넣으면 입력란이 무거울 수 있다] → 붙여넣기는 대체 경로다. F-04 성능 확인 때 함께 본다.
- [지금 데이터의 가장 이른 생성 달 이전 기록 키는 지우지 못한다] → 내보내기와 같은 한계다. 통계는 이번 달·지난달만 읽으므로 화면에는 영향이 없다.
- [저장소의 이전 달 판정 기록 키가 손상돼 있으면 교체 전 보관(`buildExport`)이 실패해 가져오기가 계속 막힌다] → 앱 시작 때 검사하는 이번 달·지난달이 아닌 키만 손상된 드문 경우다. 이때는 전체 삭제 후 가져오면 된다. 문제가 확인되면 보관 단계에서 손상된 달을 빼고 보관하도록 바꾼다.
- [가져오기가 실패하면 저장 대기 중이던 편집이 사라진다] → 교체 전에 저장 큐를 비우기(`discard`) 때문이다. 편집 뒤 설정에서 두 단계 확인을 거치는 동안 디바운스(0.4초)가 지나 대개 이미 저장돼 있다. 전체 삭제와 같은 구조로 받아들인다.
- [보관 키 `bq:backup:beforeImport`는 화면에서 되돌릴 방법이 없다] → 되돌리기 화면은 후속에서 다룬다. 가져오기를 다시 하면 덮어쓴다.

## Migration Plan

- 저장 형식 변경 없음. 새 키 하나만 생긴다.
