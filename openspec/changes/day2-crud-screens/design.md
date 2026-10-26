# Design

## Context

- day2-data-layer 결과: `ContentProvider`(`app/store.tsx`)가 로드 상태(`loading`·`ready`·`error`)와 `ContentState`를 제공하고, `useContent()`(`app/contentContext.ts`)로 `dispatch`를 쓴다. 액션은 `app/actions.ts`의 `actions.*`로 만든다. 리듀서는 검증 위반을 no-op으로 무시하므로 화면이 디스패치 전에 `validateName`·`validateCardText`로 안내 문구를 고른다.
- 현재 화면은 스타터(`App.tsx`·`App.css`)뿐이다. `App.css`는 `App.tsx`만 쓴다. `src/assets`의 스타터 이미지는 이미 아무 데서도 쓰지 않는다(이번에 건드리지 않음).
- 디자인 규칙은 `reviewq/docs/design-guide.md`와 `src/styles/tokens.css`(색·타이포 6단계·간격 6단계)다. 하드 규칙: 글자 11px 이하 금지·본문 15px 이상, 터치 타깃 44px, 하단 CTA safe area 34px, 화면 안 상단 네비 금지, 꺾쇠는 `src/components/icons.tsx` SVG, font-weight 400~700, 막다른 화면 금지.
- 공식 문서 확인 사항: 토스 내비게이션 바의 `withTitle`은 앱 아이콘·앱 이름만 표시한다(화면별 제목 API 없음). `graniteEvent.addEventListener('backEvent')`를 구독하면 기본 뒤로가기가 차단된다. 비게임 출시 가이드는 최초 화면 뒤로가기 시 종료, 자체 뒤로가기 버튼 금지를 요구한다.
- 브라우저 E2E 도구(Playwright 등)는 설치되어 있지 않다. Node 24에 내장 `WebSocket`이 있고 로컬에 Chrome이 있다.

## Goals / Non-Goals

**Goals:**
- 라우팅·표시용 계산을 순수 함수로 두어 단위 테스트하고, 화면 컴포넌트는 표시와 디스패치만 담당한다.
- devtools 브라우저에서 Day 2 완료 조건(재실행 후 유지, 연쇄 삭제)을 실제 조작으로 확인한다.

**Non-Goals:**
- React 컴포넌트 단위 테스트 도구 도입, 화면 전환 애니메이션, 접근성 전수 점검(기본 의미 요소·레이블만 지킨다).

## Decisions

1. **해시 기반 라우터를 직접 만든다(`app/router.ts`).** 경로는 `#/`(과목·덱 목록), `#/deck/{deckId}`, `#/deck/{deckId}/card/new`, `#/deck/{deckId}/card/{cardId}`. 이동은 `history.pushState`, 화면 갱신은 `popstate` 구독. 해시를 쓰면 새로고침 후에도 화면이 유지되고, 정적 번들(`ait build`)의 기본 경로와 무관하다.
   - 대안: react-router → 기각(화면 4개 미만, 의존성 추가, 기획서 8.1 "자체 경량 라우팅 권장").
   - 대안: 메모리 스택만 사용 → 기각(백버튼·새로고침과 연동되지 않음).
   - `parseRoute(hash)`·`formatRoute(route)`는 순수 함수로 테스트한다. 알 수 없는 해시는 목록 화면으로 본다.
2. **`backEvent`는 구독하지 않는다.** 구독하면 기본 뒤로가기가 막혀 최초 화면 종료를 직접 구현해야 한다. 기본 동작이 WebView 히스토리를 되돌리는 것으로 보고 히스토리 연동만 한다. 실기기 동작은 Day 6에서 확인한다(Risks 참고).
3. **하위 화면으로 바로 열리면 상위 화면을 히스토리에 채운다.** 새로고침·직접 진입 시 히스토리가 한 칸뿐이면 뒤로가기가 곧 종료가 된다. 시작 해시가 덱 상세면 `replaceState(#/)` 후 `pushState(덱)`, 카드 편집이면 목록·덱 상세를 차례로 채운다. 같은 세션의 새로고침에서는 기존 히스토리가 남아 있으므로 `history.length`와 무관하게 `history.state`에 표시(`{ seeded: true }`)가 있으면 채우지 않는다.
4. **저장·삭제 후 복귀는 `history.back()`으로 한다.** 새 항목을 push하지 않아 스택이 "목록 → 덱 상세"로 유지된다(스펙 "저장 후 복귀"). 덱 상세에서 덱을 지우는 동작은 두지 않는다(목록 화면에서만 삭제).
5. **없는 대상을 가리키는 경로는 로드 완료 후 목록으로 `replaceState`한다.** 로딩 중에는 판단하지 않는다(로드 전에는 모든 덱이 없는 것처럼 보이기 때문).
6. **표시용 계산은 `domain/selectors.ts`의 순수 함수로 둔다.** 과목별 덱 목록, 덱별 카드 수, 삭제 시 함께 지워지는 덱·카드 수, 같은 과목 내 덱 이름 중복(앞뒤 공백 제거 후 비교), 다음 복습일 표시(`오늘` 또는 `M월 D일`). 글자 수 표시는 검증과 같은 기준이어야 하므로 `validation.ts`에서 `countChars`를 export해 함께 쓴다.
7. **안내 문구는 `screens/messages.ts` 한곳에 둔다.** 검증 사유(`empty`·`tooLong`)와 대상(과목명·덱명·질문·정답)으로 문구를 고른다. 해요체.
8. **다이얼로그는 직접 만든다(`components/Dialog.tsx` 기반으로 이름 입력·삭제 확인·덱 이동).** dim 배경(`--dim`), 닫기 버튼(Close 아이콘), 취소 버튼을 둔다. 진입 즉시 띄우지 않고 사용자 동작으로만 연다. `window.prompt`·`confirm`은 쓰지 않는다(스타일 제어 불가, WebView 동작 미확인).
9. **스타일은 CSS Modules(`*.module.css`)와 토큰 변수로 작성한다(기획서 8.1).** 하단 고정 CTA는 `padding-bottom: max(34px, env(safe-area-inset-bottom))`. 화면 제목은 본문 첫 요소(`h1`, `--font-size-title`)로 둔다(상단 네비를 직접 그리지 않음). `index.css`의 `#root` 기본 padding은 유지한다.
10. **로드 상태 처리는 `App`에서 한다.** `loading`이면 불러오는 중 안내, `error`면 실패 안내만 보여 주고 화면(편집 동작)을 렌더하지 않는다. 실패 안내 화면도 플랫폼 닫기로 나갈 수 있어 막다른 화면이 아니다.
11. **통합 확인은 Chrome DevTools Protocol 스크립트로 한다.** 저장소 밖(세션 scratchpad)에 Node 내장 `WebSocket`으로 헤드리스 Chrome을 조작하는 스크립트를 두고, 생성 → 새로고침 → 유지 확인 → 과목 삭제 → 새로고침 → 사라짐 확인, 뒤로가기 이동, 렌더된 글자 크기 최소값(13px 이상), 터치 타깃 높이(44px 이상)를 점검한다. 프로젝트 의존성은 추가하지 않는다.
    - 대안: Playwright devDependency → 보류(브라우저 바이너리 설치 부담, Day 3 이후 반복 필요성이 커지면 재검토).
12. **본문 글꼴 순서를 "텍스트 글꼴 → Tossface"로 바꾼다(`src/styles/base.css`, 구현 중 추가).** Tossface CSS의 `unicode-range`에 숫자(U+30-39)·`#`·`*`·©·®·™가 포함돼 있어, Tossface를 맨 앞에 두면 카드 수·글자 수 같은 일반 숫자가 이모지 글꼴로 그려졌다(통합 확인 캡처에서 발견). 순서를 바꾼 뒤 렌더 글꼴을 CDP `CSS.getPlatformFontsForNode`로 확인했다: 숫자·한글은 텍스트 글꼴, 😀🔥📚·❤️·키캡 이모지는 Tossface.
    - 대안: Tossface 앞 유지 + 숫자 영역만 `.tf` 제외 처리 → 기각(숫자가 나오는 모든 곳에 클래스를 달아야 함).

## Risks / Trade-offs

- [토스 앱 WebView에서 기본 뒤로가기가 히스토리를 따르지 않을 수 있다] → Day 6 실기기 체크리스트에 "하위 화면 뒤로가기·최초 화면 종료"를 넣는다. 다르면 `backEvent`를 구독해 `history.back()`·종료를 직접 처리하도록 바꾼다(라우터 내부 변경으로 한정).
- [새로고침 직전 400ms 안의 변경] → `visibilitychange` hidden 시 flush가 있지만 비동기 저장이 끝나기 전에 페이지가 내려가면 유실될 수 있다. 통합 확인은 마지막 편집 후 저장 지연이 지난 뒤 새로고침한다. 실기기 종료 시 동작은 Day 6.
- [가상 키보드가 입력란·하단 CTA를 가릴 수 있다] → 카드 편집은 하단 고정 대신 입력란 아래에 버튼을 두는 흐름 배치로 한다. 실기기 확인은 Day 6(기획서 5.3 [검증 필요]).
- [CDP 스크립트는 저장소에 남지 않는다] → 재현 절차를 tasks 검증 항목에 적어 둔다. 반복이 잦아지면 Playwright 도입을 다시 검토한다.
