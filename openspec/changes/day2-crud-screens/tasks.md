# Tasks

모든 경로는 `reviewq/` 기준이다.

## 1. 순수 로직

- [x] 1.1 `src/app/router.ts`에 `Route` 타입, `parseRoute`·`formatRoute`, 시작 시 상위 화면을 히스토리에 채울 경로 목록 계산(`seedRoutes`)을 구현하고 `router.test.ts`를 작성한다. 검증: 네 가지 경로의 왕복 변환, 알 수 없는 해시 → 목록, 카드 편집 시작 시 목록·덱 상세가 채워지는 테스트가 통과한다
- [x] 1.2 `src/domain/validation.ts`에서 `countChars`를 export하고, `src/domain/selectors.ts`(과목별 덱, 덱별 카드 수, 삭제 요약, 덱 이름 중복, 다음 복습일 표시)와 `src/screens/messages.ts`(검증 사유·대상별 문구)를 구현하고 테스트한다. 검증: 과목 삭제 요약 "덱 2개·카드 5장", 공백 차이 중복 이름 감지, 오늘 → "오늘"·2026-11-02 → "11월 2일", 사유별 문구 테스트가 통과한다

## 2. 화면 골격

- [x] 2.1 `useRoute` 훅(현재 경로, `navigate`, `back`, `popstate` 구독, 시작 시 히스토리 채우기)과 `src/components/Dialog.tsx`(dim·닫기·취소), 이름 입력·삭제 확인·덱 이동 다이얼로그를 구현한다. `App.tsx`를 로딩·실패 안내와 경로별 화면 분기로 교체하고 `App.css`를 제거한다. 없는 대상을 가리키는 경로는 로드 후 목록으로 바꾼다. 검증: `npx tsc -b`·`npm run lint`가 통과한다

## 3. 화면

- [x] 3.1 `src/screens/SubjectList/`: 과목별 덱·카드 수 표시, 과목·덱 생성·이름 변경(검증 안내, 중복 덱 이름 경고), 덱 이동(다른 과목이 없으면 비활성), 삭제 확인(하위 항목 수 표시), 덱 진입, 빈 상태 안내를 구현한다. 검증: tsc·lint 통과, devtools에서 각 동작을 한 번씩 수행해 목록이 기대대로 바뀐다
- [x] 3.2 `src/screens/DeckDetail/`: 덱 이름, 카드 목록(질문 미리보기·다음 복습일), 카드 추가, 카드 편집 진입, 빈 상태 안내를 구현한다. 검증: tsc·lint 통과, devtools에서 빈 덱 안내와 카드 2장 목록이 보인다
- [x] 3.3 `src/screens/CardEditor/`: 질문·정답 입력과 글자 수(n/500), 입력란별 검증 안내, 새 카드 "저장"·"저장 후 계속", 기존 카드 "저장"·"삭제"(확인), 저장·삭제 후 `back()`을 구현한다. 검증: tsc·lint 통과, devtools에서 정답 누락 안내, 저장 후 계속 시 입력란 초기화, 저장 후 덱 상세 복귀를 확인한다

## 4. 통합 확인

- [x] 4.1 scratchpad의 CDP 스크립트로 헤드리스 Chrome(devtools dev 서버)에서 확인한다: 과목 1·덱 1·카드 2 생성 → 저장 지연 후 새로고침 → 같은 데이터, 목록 → 덱 상세 → 카드 편집 → 뒤로가기 2회 → 목록, 과목 삭제(확인) → 새로고침 → 사라짐, 렌더된 텍스트 최소 13px·버튼 높이 44px 이상. 이어서 `npm test -- --run`과 `npm run build`가 통과한다. 화면 캡처를 사용자에게 공유한다

## Workflow follow-up

- 실기기에서 하위 화면 뒤로가기·최초 화면 종료·가상 키보드 가림 여부는 Day 6 체크리스트로 넘긴다.
- 리뷰 후 커밋·푸시하고 change를 archive한다.
