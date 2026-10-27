# Design

## Context

- 경로는 `app/router.ts`의 해시 기반 `Route` 유니언이다. 통계(`#/stats`, seed [home])가 바로 앞선 예이며, 홈 본문에 "통계" 진입 행이 있다(`Home.tsx`).
- 저장소 어댑터(`StorageAdapter`)에는 `getItems`·`setItems`·`removeItem`·`clearItems`가 있고, 키 목록을 얻는 API는 없다. SDK `Storage`(3.8.1)에도 없다. 판정 기록은 `bq:logs:YYYY-MM` 월별 키이고, 앱은 이번 달과 지난달만 로드한다(`loadContent`).
- 콘텐츠 저장은 `store.tsx`의 모듈 수준 `saveQueue`(디바운스 400ms, 실패 시 1·2·4초 재시도)가 맡는다. `flush()`는 있지만 대기 중인 변경을 버리는 기능은 없다. Meta는 `metaStore`가 단독으로 쓴다.
- 다시 불러오기는 `bootstrap.reloadApp()`이 하고, `ContentProvider`가 `subscribeAppStart`로 결과를 받는다. 빈 저장소에서 `loadApp`은 `lastOpenedDate = today`인 새 Meta를 만들고, 그날 백업은 만들지 않는다.
- 형식 검증은 `infra/storage/validate.ts`의 `isSubject`·`isDeck`·`isCard`·`isReviewLog`를 쓴다.
- SDK 파일 저장: `File.saveBase64({ data, fileName, mimeType })`. 토스 앱 Android 5.218.0·iOS 5.216.0 이상이고 `isSupported()`가 있다. 공식 문서(파일 저장)에는 권한 요구가 없다. 클립보드(`Clipboard.setText`)는 `clipboard` 권한이 필요해 `apps-in-toss.config.ts`의 `permissions`(현재 비어 있음)를 바꿔야 한다.
- 알림 동의 요청 로직은 `components/NotificationOptIn.tsx` 안에 있다(`canAsk`, `requestAgreement`, 기록 저장).
- 대화상자는 `components/Dialog.tsx`가 있다(학습 세션 그만하기 확인 등에서 사용).

## Goals / Non-Goals

**Goals:**
- 알림을 거부한 사용자가 다시 동의할 경로를 만들어, Day 7 게이트에서 알림 플래그를 켤 수 있게 한다.
- 새 권한이나 의존성 없이 사용자가 데이터 전체를 기기 밖에 보관할 수 있게 한다.
- 전체 삭제 뒤 이전 데이터가 저장 큐나 메모리에서 되살아나지 않게 한다.

**Non-Goals:**
- 백업 가져오기(F13). 형식 버전을 넣어 v1.1 가져오기에 대비만 한다.
- 마지막 내보내기 날짜 기록(Meta 형식 변경), 앱 정보 화면.
- 알림 수신 철회(SDK에 철회 API가 없다).

## Decisions

1. **경로 `#/settings`, seed [home].**
   - `Route`에 `{ name: 'settings' }`를 더하고 `parseRoute`·`formatRoute`·`seedRoutes`를 통계와 같은 방식으로 넓힌다. `routeTargetExists`는 deckId가 없는 경로라 그대로 true다.
   - 홈 본문의 "통계" 행 바로 아래에 같은 행 스타일로 "설정" 행을 둔다. 하단 버튼은 바꾸지 않는다.
2. **설정 화면 구성(`screens/Settings/Settings.tsx`).** 위에서부터:
   - 저장 위치 고지 블록(항상). 문구는 `messages.ts`의 `SETTINGS`에 둔다.
   - "백업" 섹션: 설명 한 줄과 "백업 내보내기" 보조 버튼, 결과 안내, 대체 텍스트 영역.
   - "복습 알림" 섹션(노출 조건을 만족할 때만): 상태 텍스트와 "알림 받기" 버튼.
   - "데이터" 섹션: 위험 스타일 "모든 데이터 삭제" 버튼.
   - 하단 고정 CTA는 두지 않는다(통계 화면처럼 뒤로가기는 플랫폼). 터치 44px·본문 15px 이상·`keep-all` 등 AGENTS.md 하드 규칙을 따른다.
3. **내보내기 문서는 순수 함수로 만들고, 판정 기록은 월 범위를 계산해 읽는다(`infra/storage/exportData.ts`).**
   - 형태: `{ format: 'reviewq-backup', formatVersion: 1, exportedAt, schemaVersion, subjects, decks, cards: Record<deckId, Card[]>, logs: Record<'YYYY-MM', ReviewLog[]> }`. `schemaVersion`은 현재 Meta 값이다. 알림 기록·`installId`·백업·격리 키는 넣지 않는다.
   - 과목·덱·카드는 메모리의 `ContentState`를 쓰되, 먼저 `saveQueue.flush()`를 기다려 저장소와 같게 만든다. `flush()`는 저장이 실패해도 예외 없이 끝나므로, 메모리에 올라온 달(이번 달·지난달)의 판정 기록도 메모리 값을 써서 카드 일정과 판정 기록이 어긋나지 않게 한다.
   - 판정 기록: 키 목록 API가 없으므로, 과목·덱·카드의 가장 이른 `createdAt` 달부터 이번 달까지 중 메모리에 없는 달의 `bq:logs:` 키를 `getItems` 한 번으로 읽는다. 판정 기록은 카드가 있어야 생기므로 남아 있는 데이터의 가장 이른 생성일 이전 기록은 대부분 없다. 비어 있거나 `null`인 달은 빼고, 형식 검증에 실패한 달이 있으면 내보내기를 실패로 처리한다(일부만 내보내지 않는다).
   - 만든 뒤 `validateExport(doc)`로 모든 항목을 `isSubject`·`isDeck`·`isCard`·`isReviewLog`로 다시 검사한다. 이 함수는 v1.1 가져오기에서도 쓴다.
   - 대안: 저장된 전체 키를 덤프 → 기각. 키 목록 API가 없다. 대안: 판정 기록 제외 → 기각. 통계(최근 7일)와 D-06 "로그가 같다"를 만족하지 못한다.
4. **파일 저장은 `File.saveBase64`, 불가하면 읽기 전용 텍스트.**
   - `fileName = reviewq-backup-${today}.json`, `mimeType = 'application/json'`, `data`는 UTF-8 JSON을 base64로 바꾼 값(한글이 있으므로 `TextEncoder`로 바이트를 만든 뒤 인코딩).
   - `File.saveBase64.isSupported()`가 false이거나 토스 앱이 최소 버전 미만이거나(SDK 문서상 최소 버전 미만에서는 오류 없이 아무것도 하지 않는다) 호출이 reject되면 `<textarea readOnly>`에 JSON(들여쓰기 2칸)을 보여 주고 "길게 눌러 전체 선택한 뒤 복사해 주세요" 안내를 붙인다. reject면 실패 안내도 함께 보여 준다.
   - 클립보드 API는 권한 추가(검수 항목 증가)가 필요해 쓰지 않는다.
   - 진행 중에는 버튼을 비활성화한다(연타 1회 처리).
5. **전체 삭제는 저장 큐를 먼저 비운 뒤 `clearItems`, 그다음 다시 불러오기.**
   - `SaveQueue`에 `discard()`를 더한다: 대기 타이머·재시도 타이머를 취소하고 대기 중인 변경을 버리며, 실행 중인 쓰기가 있으면 끝날 때까지 기다린다. 실패 상태는 ok로 되돌린다.
   - 순서: `await saveQueue.discard()` → `await appStorage.clearItems()` → `await reloadApp()`. `reloadApp`이 빈 저장소에서 새 Meta를 만들고 `metaStore.reset`으로 알림 기록도 비워진다. `ContentProvider`는 기존 구독으로 빈 상태를 받고, 경로는 `replace({ name: 'home' })`로 홈으로 보낸다.
   - `store.tsx`에 `clearAllData()`를 두어 저장 큐와 다시 불러오기를 한곳에서 다룬다(저장 큐가 이 모듈에 있기 때문).
   - `clearItems`가 실패하면 저장 큐는 이미 비워졌으므로, 메모리 상태를 되돌려 쓰지 않고 `reloadApp()`으로 저장소의 실제 상태를 다시 읽는다. 화면에는 실패 안내와 다시 시도를 보여 준다.
   - 대안: 키를 하나씩 `removeItem` → 기각. 키 목록을 알 수 없어 격리·옛 월 기록 키를 빠뜨린다.
6. **2단계 확인은 기존 `Dialog`를 두 번 쓴다.**
   - 1단계: 제목 "모든 데이터를 지울까요?", 본문에 지워지는 대상(과목·덱·카드·학습 기록·알림 설정 기록)과 "되돌릴 수 없어요, 먼저 백업 내보내기를 해 두세요". 버튼 [취소 | 계속].
   - 2단계: "정말 지울까요?" 버튼 [취소 | 삭제(위험 스타일)].
7. **알림 동의 요청 로직을 훅으로 분리한다(`components/useNotificationAgreement.ts`).**
   - `canAsk()`·요청·결과 기록·해제 처리를 훅으로 옮기고, `NotificationOptIn`(학습 완료)과 설정의 알림 항목이 같이 쓴다. 학습 완료 화면 동작은 바꾸지 않는다.
   - 설정 상태 문구: 기록 없음 → "아직 정하지 않았어요", `agreed: false` → "받지 않고 있어요", `agreed: true` → "복습 알림을 받고 있어요"(버튼 없음, "알림을 끄려면 토스 앱 설정에서 바꿀 수 있어요" 안내).
8. **검증.**
   - 단위 테스트: `buildExport`(내용·제외 항목·월 범위 계산·빈 데이터), `validateExport`, base64 인코딩(한글 왕복), `saveQueue.discard`(대기 변경이 저장되지 않음·실행 중 쓰기 대기), 라우터 `settings`.
   - CDP(`handoff/e2e/settings.mjs`): 진입·뒤로가기·주소 직접 열기, 고지 표시, 내보내기(모의 `File.saveBase64` 호출 인자 캡처·문서 검증·미지원/실패 시 텍스트), 전체 삭제(1·2단계 취소, 실행 후 `bq:` 키, 편집 직후 삭제, `clearItems` 실패 주입), 알림 항목(플래그 off/on·미지원·재요청 동의/거부/오류·진입 시 요청 0회).

## Risks / Trade-offs

- [Android에서 파일이 어디에 저장되고 사용자가 찾을 수 있는지 모른다] → Day 6 실기기에서 확인한다. 찾기 어렵다면 저장 완료 안내 문구에 위치를 적고, 필요하면 v1.0.x에서 클립보드 권한 추가를 검토한다.
- [`clearItems`가 이 미니앱 저장소만 지우는지 SDK 문서로 확인하지 못했다] → data-storage spec이 "앱의 저장 데이터를 전부 삭제"로 정의하고 있어 그대로 따르며, Day 6에서 다른 미니앱 데이터에 영향이 없는지 확인할 방법은 없다. 문서 표현을 근거로 둔다.
- [남아 있는 과목·덱·카드보다 이전에 만든 카드(이미 삭제됨)의 판정 기록은 내보내지 못할 수 있다] → 삭제된 카드의 기록은 통계 외에는 쓰이지 않는다. v2.0 서버 동기화에서 근본 대응한다.
- [전체 삭제 후 알림 기록이 사라져 학습 완료 화면에서 다시 동의를 묻는다] → 사용자가 모든 데이터를 지운 것이므로 첫 사용과 같게 보는 것이 맞다. 토스 쪽 동의 상태는 `alreadyAgreed`로 돌아와 동의로 기록된다.
- [전체 삭제 중에 이미 시작된 Meta 저장(날짜가 바뀐 직후의 마지막으로 연 날 갱신, 결과를 기다리던 알림 동의 기록)이 `clearItems` 뒤에 끝나면 옛 `installId`·알림 기록이 담긴 Meta가 남을 수 있다] → `clearAll`은 콘텐츠 저장 큐만 비우고 `metaStore`의 진행 중 쓰기는 기다리지 않는다. 자정 직후 설정에서 바로 삭제하는 등 드문 조건이라 이번에는 고치지 않는다. 문제가 확인되면 `metaStore`에 진행 중 쓰기를 기다리는 기능을 더해 삭제 전에 기다린다.
- [내보내기 텍스트가 카드 수천 장이면 textarea가 무거울 수 있다] → 대체 경로에서만 그리고, 3,000장 기준 수백 KB라 한 번 그리는 데 문제 되지 않을 것으로 본다(가정). F-04 성능 확인 때 함께 본다.

## Migration Plan

- 저장 형식 변경이 없어 마이그레이션은 없다. 되돌리면 설정 화면만 사라지고 데이터는 그대로다.
