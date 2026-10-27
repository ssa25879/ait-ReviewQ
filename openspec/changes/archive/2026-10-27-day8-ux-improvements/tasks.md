# Tasks

모든 경로는 `reviewq/` 기준이다. 화면 동작 검증은 CDP 스크립트(헤드리스 Edge, PowerShell에서 node 실행, 출력 폴더는 절대 경로)로 하고, dev 서버는 프로젝트의 `node_modules/.bin/vite`로 띄운다.

## 1. 가져오기 확인 팝업

- [x] 1.1 `ConfirmDialog`의 `detail`을 `ReactNode`로 넓히고, 가져오기를 검증 통과 즉시 확인 팝업(요약·날짜·경고, [취소 | 바꾸기])으로 바꾼다(design 결정 1). 검증: 6.1 CDP

## 2. 홈

- [x] 2.1 홈 머리말(복습큐·날짜), 바로가기 타일 3칸, 하단 버튼 구성, 아이콘 3종을 만든다(design 결정 2). 검증: 6.1 CDP

## 3. 용어

- [x] 3.1 화면 문구의 "덱"을 "단원"으로 바꾼다(design 결정 3). 검증: `grep`으로 `src`의 문구(주석·식별자 제외)에 "덱" 0건, 6.1 CDP의 화면 전체 "덱" 없음 항목

## 4. 최초 실행 가이드

- [x] 4.1 `bq:guide` 키·`startApp`의 `guideSeen`·컨텍스트 `markGuideSeen`, 경로 `guide`, `screens/Guide`, `App`의 첫 ready 1회 판단, 예시 덱 로직 공유, 설정의 "사용 방법 보기"를 만든다(design 결정 4). 검증: 단위 테스트(라우터·키 읽기), 6.1 CDP

## 5. 기존 CDP 스크립트

- [x] 5.1 `handoff/e2e/*.mjs`에서 저장소를 비운 뒤 `bq:guide`를 넣고, "덱" 기대값을 "단원"으로, 가져오기 흐름을 팝업으로, 홈 하단 버튼 기대값을 새 구성으로 고친다(바꾼 내용은 보고에 적기)

## 6. 통합 확인

- [x] 6.1 `npx tsc -b`·lint·`npm test -- --run`·`npm run build`가 통과하고, 새 `handoff/e2e/ux.mjs`와 기존 CDP 스크립트 10종이 통과한다. 홈·가이드 화면 캡처를 사용자에게 공유한다
