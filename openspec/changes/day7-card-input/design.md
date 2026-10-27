# Design

## Context

- 카드는 `actions.addCard(deckId, q, a)`가 만든 `card/add` 액션으로 생긴다. 리듀서가 입력 제한(1~500자)을 다시 검사하고, 신규 카드는 오늘 복습 대상이다. 저장은 상태 변경을 디바운스 저장 큐가 맡는다.
- 경로는 `app/router.ts`의 해시 `Route` 유니언이다. 덱 하위 화면(`cardNew` 등)은 seed가 [home, subjects, deck]이다.
- 홈 첫 사용 상태(`totalCards === 0`)는 본문에 안내, 하단 고정 버튼에 "과목·덱 만들기"가 있다.
- 기능 플래그는 `config/flags.ts`의 `readFlags(import.meta.env)`가 읽는다. Vite는 `import.meta.env.VITE_*`를 빌드 때 문자열 상수로 바꾸므로, 조건식을 그 자리에서 쓰면 꺼진 쪽 코드는 번들에서 빠진다.
- 선행 `day7-backup-import`가 `store.tsx`의 `replaceAll(doc)`(저장 큐 비우기 → 교체 → 다시 불러오기)을 만든다.

## Goals / Non-Goals

**Goals:**
- 정리해 둔 목록을 한 번의 붙여넣기로 덱에 넣는다.
- 첫 사용자가 카드를 만들기 전에 학습 흐름을 본다.
- 실기기 검증 때 손 입력 없이 실제와 비슷한 데이터(학습 기록·여러 단계)를 갖춘다.

**Non-Goals:**
- CSV 파일, 중복 거르기, 일괄 편집.

## Decisions

1. **줄 해석은 순수 함수 `parseBulkCards(text)`(`domain/bulkCards.ts`).**
   - 반환: `{ cards: { line, question, answer }[], errors: { line, reason }[], tooMany: boolean }`. `reason`은 `noSeparator`·`emptyQuestion`·`emptyAnswer`·`tooLong`.
   - 줄바꿈은 `\r\n`·`\n` 모두 받는다. 구분자는 줄마다 탭 → `" / "` → `"|"` 순으로 첫 번째만 쓴다. 길이 검사는 `validateCardText`를 그대로 써서 카드 편집 화면과 같은 기준이다.
   - `BULK_MAX_LINES = 200`. 빈 줄을 뺀 줄 수가 넘으면 `tooMany`.
2. **화면 `screens/CardBulk/CardBulk.tsx`, 경로 `#/deck/{deckId}/cards/bulk`(`cardBulk`, seed [home, subjects, deck]).**
   - 제목(덱 이름), 형식 안내(세 가지 예시), 여러 줄 입력란, 미리 보기("N장 추가 예정"·오류 줄 목록 최대 20개와 "외 M줄"), 하단 고정 "N장 추가" 버튼.
   - 추가: 올바른 줄마다 `actions.addCard`를 디스패치한다(한 이벤트 안이라 렌더는 한 번). 오류가 없으면 `back()`, 있으면 입력란을 오류 줄만으로 바꾸고 "N장을 추가했어요" 안내. ref로 연타를 막는다.
   - 대안: `card/addMany` 리듀서 액션 → 기각. 200장 기준으로 액션 반복이 문제 되지 않고, 기존 검증·일정 초기화 경로를 그대로 쓴다.
   - 덱 상세에는 목록 위(빈 상태면 안내 아래)에 행 스타일의 "여러 장 한 번에 추가" 버튼을 둔다. 하단 버튼 구성은 바꾸지 않는다.
3. **예시 덱은 `domain/sampleDeck.ts`의 고정 목록 + `Home`의 보조 버튼.**
   - `SAMPLE_SUBJECT = '예시'`, `SAMPLE_DECK = '영단어 기초'`, 카드 10장(영단어·뜻). 만들기는 `addSubject` → `addDeck` → `addCard`×10 디스패치.
   - 첫 사용 안내 블록 안에 보조 버튼과 "예시 과목은 과목·덱 관리에서 지울 수 있어요" 안내. 카드가 생기면 첫 사용 상태가 끝나 버튼이 사라진다. ref로 연타를 막는다.
4. **데모 데이터는 플래그 빌드에서만 동적으로 불러온다.**
   - `Settings.tsx`: `const DemoSection = import.meta.env.VITE_DEMO_DATA === 'true' ? lazy(() => import('./DemoSection')) : null;` 꺼진 빌드에서는 조건이 상수 false가 되어 `DemoSection`·`dev/demoData.ts`가 번들에서 빠진다. 다른 곳에서 읽을 일이 없어 `flags.ts`에는 두지 않는다(객체 필드를 거치면 번들 제외를 보장하기 어렵다).
   - `dev/demoData.ts`의 `buildDemoDoc(today, newId)`: 과목 3·덱 3·카드 22장을 만들고, 리듀서로 지난 7일에 걸친 판정(`card/review`)을 적용해 여러 단계·미래 복습일·오늘 복습 카드·최근 7일 기록이 생기게 한 뒤 `ExportDoc`으로 돌려준다. `DemoSection`은 확인(`ConfirmDialog`) 뒤 `replaceAll(doc)`을 부르고 홈으로 간다.
   - `.env.example`에 `VITE_DEMO_DATA=false`를 더한다.
5. **검증.**
   - 단위 테스트: `parseBulkCards`(세 구분자·우선순위·정답 안의 구분자·빈 줄·오류 이유·500자·200줄), `buildDemoDoc`(형식 검증 통과·과목 3 이상·오늘 복습·미래 복습일·최근 7일 기록), 라우터 `cardBulk`.
   - CDP(`handoff/e2e/card-input.mjs`): 덱 상세 진입·뒤로가기, 붙여넣기 미리 보기·오류 줄·추가·연타·오류 줄 남김, 200줄 초과, 홈 예시 덱(생성·숨김·연타), 기본 빌드에 데모 버튼 없음, 플래그 빌드(별도 포트)의 데모 채우기·취소. 기본 빌드 `dist/`에서 데모 전용 문자열 검색 0건.

## Risks / Trade-offs

- [질문에 " / "나 "|"가 들어가면 잘못 나뉜다] → 첫 구분자로만 나누고 미리 보기로 보여 주므로 추가 전에 알아챌 수 있다. 탭 형식(스프레드시트)은 이 문제가 없다.
- [예시 과목이 실제 데이터와 섞인다] → 이름을 "예시"로 고정하고 지우는 방법을 안내한다.
- [데모 데이터 채우기는 지금 데이터를 바꾼다] → 테스트 빌드에서만 보이고 확인을 받는다. 가져오기와 같이 이전 데이터를 보관 키에 남긴다.

## Migration Plan

- 저장 형식 변경 없음.
