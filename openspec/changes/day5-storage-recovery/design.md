# Design

## Context

- 시작 흐름: `app/bootstrap.ts`가 `initMeta` → `recordOpened` → `loadContent`를 한 번 실행하고, `ContentProvider`(`app/store.tsx`)가 결과를 받아 `status`를 `ready`/`error`로 둔다. `App.tsx`는 `error`면 고정 안내만 보인다(동작 없음).
- `loadContent`(`infra/storage/loadContent.ts`)는 JSON 파싱만 하고, 실패하면 첫 번째 손상 키에서 예외를 던진다. `initMeta`도 파싱 실패 시 예외를 던진다. 저장소 호출 실패와 손상이 같은 `error`로 합쳐진다.
- `createSaveQueue`(`infra/storage/saveQueue.ts`)는 실패한 항목을 되돌려 다음 저장 때 함께 쓰지만(data-storage "저장 실패 시 변경 보존"), 재시도·안내는 없고 `onError`로 콘솔 로그만 남긴다.
- 저장 접근은 `StorageAdapter`(`getItems`·`setItems`·`removeItem`·`clearItems`)만 쓴다. 키는 `infra/storage/keys.ts`가 만든다.
- 검증 선례: memoryStorage 단위 테스트, scratchpad 헤드리스 Edge CDP(devtools 모의 저장소는 localStorage `__ait_storage:` 접두사).

## Goals / Non-Goals

**Goals:**
- 손상(데이터 형식 문제)과 저장소 호출 실패(데이터 접근 문제)를 다른 결과로 구분해 화면이 각각 맞는 선택지를 준다.
- 어떤 복구 경로도 원본을 먼저 보존한 뒤에만 키를 바꾼다.

**Non-Goals:**
- 손상 키 안의 정상 항목만 골라 살리는 부분 복구.
- 덱·카드 참조 관계 보정(존재하지 않는 덱을 가리키는 카드 등).

## Decisions

1. **검증은 `infra/storage/validate.ts`의 순수 함수로 둔다.**
   - 항목별 검사기 `isSubject`·`isDeck`·`isCard`·`isReviewLog`·`isMeta`와, 키 단위 `parseValidList(raw, isItem)` → `{ ok: true, value } | { ok: false }`.
   - 검사 항목: 필수 필드 존재·타입, 날짜 `YYYY-MM-DD` 정규식, 이름 1~30자·질문/정답 1~500자(`domain/validation.ts`의 상수 재사용), `stage` 정수 0~6, ISO 시각 문자열.
   - 대안: 스키마 라이브러리 → 기각(기획서 7.5 "외부 검증 라이브러리는 쓰지 않는다", 의존성 추가 없음).
2. **로드 결과를 판별 유니온으로 바꾼다.** `loadAll(storage, today)` → `{ kind: 'ok', meta, content } | { kind: 'corrupt', corruptKeys, raw, meta?, partial } | { kind: 'readFailed', error }`.
   - `getItems` 예외는 `readFailed`, 검증 실패는 `corrupt`로 나눈다. `corrupt`에는 원본 문자열(`raw`)을 담아 격리에 쓴다.
   - 덱 목록이 손상이면 카드 키를 알 수 없으므로 카드 키는 읽지 않는다(백업 복구 후 다시 로드).
   - `bootstrap`은 이 함수를 감싸 재호출할 수 있는 `loadApp()`으로 바꾼다("다시 시도"·복구 후 재로드). 모듈 시작 시 한 번 실행하는 기존 동작은 `loadApp()`의 첫 호출 결과를 공유해 유지한다.
3. **백업(`infra/storage/backup.ts`).** 값은 `{ date, savedAt, subjects, decks, cards }` JSON.
   - `kind: 'ok'`이고 백업 `date !== today`일 때만 `bq:backup:last`를 저장한다. 저장 실패는 콘솔 오류만 남긴다(다음 날 재시도).
   - 판정 기록은 넣지 않는다. 월별로 계속 쌓여 크기가 커지고, 일정 복원에 필요한 정보는 카드 `schedule`에 있다.
   - 읽을 때도 `validate`로 검사하고, 실패하면 "사용할 수 있는 백업 없음"으로 본다.
4. **복구 동작(`infra/storage/recovery.ts`)은 "격리 → 변경" 순서를 지킨다.**
   - `quarantine(storage, raw)`: 손상 키마다 `bq:quarantine:{key}`에 원본을 `setItems`로 먼저 저장한다. 실패하면 예외를 던지고 이후 단계를 하지 않는다.
   - `restoreFromBackup`: 격리 → 백업의 과목·덱·덱별 카드 키 저장, 백업에 없는 기존 덱의 카드 키 삭제, 손상된 로그 키는 `[]`로 저장, 손상된 Meta는 새로 생성.
   - `dropCorrupt`: 격리 → 손상 키 삭제(빈 값으로 로드되게 함), Meta 손상이면 새로 생성.
   - 두 동작 모두 끝나면 `loadApp()`을 다시 호출한다.
5. **화면.**
   - `screens/Recovery/Recovery.tsx`: `corrupt`일 때 라우트와 무관하게 `App`이 보여 준다. 제목, 손상 항목 수, 백업 카드(날짜·과목/덱/카드 수), 하단 버튼("백업으로 복구" 주 / "손상 항목 빼고 열기" 보조, 백업 없으면 후자가 주), 본문 안 "다시 시도" 텍스트 버튼. "손상 항목 빼고 열기"는 기존 `ConfirmDialog`로 확인한다. 진입 시 대화상자 없음.
   - `readFailed`: 안내 문구와 "다시 시도" 버튼만 있는 화면(복구 동작 없음).
   - 복구 진행 중에는 버튼을 비활성화해 연타를 막는다.
6. **저장 실패 재시도.**
   - `saveQueue`에 `retryDelaysMs = [1000, 2000, 4000]`과 `onStatus(status: 'ok' | 'failed')`를 추가한다. 실패하면 되돌린 항목을 지정 간격 뒤 다시 저장하고, 3회째도 실패하면 `failed`를 알리고 자동 재시도를 멈춘다. 다음 `enqueue`·`flush`(판정·백그라운드 전환·"다시 시도")는 다시 저장을 시도하고 횟수를 초기화한다. 성공하면 `ok`를 알린다.
   - 재시도 타이머는 저장 실패 때만 걸리고 최대 3회라 브릿지 과다 호출 금지(기획서 7.4)에 맞는다.
   - `ContentProvider`가 상태를 받아 `saveFailed`와 `retrySave()`를 컨텍스트로 내보내고, `components/SaveErrorNotice.tsx`가 화면 상단 본문 흐름 안(제목 아래)에 안내를 그린다. 하단 고정 버튼과 겹치지 않는다.
7. **문구는 `screens/messages.ts`의 `RECOVERY`·`SAVE_ERROR`에 둔다.**

## Risks / Trade-offs

- [하루 1회 백업이라 백업 이후의 변경은 복구하면 사라진다] → 복구 화면에 백업 날짜를 보여 주고, "손상 항목 빼고 열기"와 비교해 고르게 한다.
- [백업 키 하나가 카드 수에 비례해 커진다(1,000장 약 1MB)] → 큰 문자열 저장 한도는 기획서 7.6 [검증 필요]다. 백업 저장 실패는 앱 동작을 막지 않고 Day 6 실기기에서 3,000장 저장을 측정한다.
- [격리 키가 남아 저장 공간을 쓴다] → 손상은 드물고 원본 보존이 우선이다. 정리는 설정의 전체 삭제(후속)에서 다룬다.
- [실제 Storage 실패의 오류 형태를 모른다(기획서 7.6 [검증 필요])] → 오류 종류로 분기하지 않고, 예외 발생 여부만으로 실패를 판정한다.

## Migration Plan

- 저장 형식·`schemaVersion` 변경 없음. 새 키(`bq:backup:last`, `bq:quarantine:*`)만 추가된다.
- 배포 후 첫 정상 실행에서 백업이 만들어진다. 그 전에 손상이 생기면 "손상 항목 빼고 열기"만 가능하다.
- 롤백하면 이전 번들은 새 키를 읽지 않으므로 영향이 없다.
