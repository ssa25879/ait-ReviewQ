# Tasks

모든 경로는 `reviewq/` 기준이다. 화면 동작 검증은 CDP 스크립트(헤드리스 Edge, PowerShell에서 node 실행, 출력 폴더는 절대 경로)로 한다.

## 1. 해석·교체 로직

- [x] 1.1 `infra/storage/importData.ts`에 `parseImport`와 요약을 만든다(design 결정 1). 검증: 단위 테스트로 정상 요약 수치, `notJson`·`invalid`·`newer`(형식 버전·데이터 버전 각각)·`inconsistent`(과목 없는 덱·덱 없는 카드 키·deckId 불일치)를 확인한다
- [x] 1.2 같은 파일에 `importBackup`과 `keys.ts`의 `BEFORE_IMPORT_KEY`를 만든다(design 결정 2). 검증: 단위 테스트로 교체 후 과목·덱·카드·기록 키, 보관 키에 이전 데이터(내보내기 형식), `bq:meta` 불변, 지금에만 있던 카드·기록 키 삭제, `bq:backup:last` 갱신, 보관 저장 실패 시 저장소 무변경, 내보내기 → 가져오기 왕복 후 상태가 같음(D-06)을 확인한다

## 2. 연결과 화면

- [x] 2.1 `store.tsx`·`contentContext.ts`에 `replaceAll`을 더한다(design 결정 3). 검증: 3.1 CDP의 저장 대기 중 가져오기·실패 주입 항목
- [x] 2.2 설정의 백업 섹션에 가져오기(파일 선택·붙여넣기·요약·2단계 확인)를 만들고 문구는 `messages.ts`의 `IMPORT`에 둔다(design 결정 4). 검증: 3.1 CDP

## 3. 통합 확인

- [x] 3.1 `npx tsc -b`·lint·`npm test -- --run`·`npm run build`가 통과하고, CDP 스크립트 `handoff/e2e/import.mjs`(붙여넣기·파일 입력 흐름, 이유별 안내, 2단계 취소, 저장 대기 중 가져오기 후 카드 미생성, 보관 실패 주입, 가져온 뒤 홈·통계 수치, 글자 13px·터치 44px)를 새로 두어 통과시킨다. 기존 CDP 스크립트(settings 포함)가 그대로 통과한다
