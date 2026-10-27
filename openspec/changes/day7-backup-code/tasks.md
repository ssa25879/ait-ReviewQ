# Tasks

모든 경로는 `reviewq/` 기준이다. 화면 동작 검증은 CDP 스크립트(헤드리스 Edge, PowerShell에서 node 실행, 출력 폴더는 절대 경로)로 한다.

## 1. 백업 코드

- [x] 1.1 `infra/storage/backupCode.ts`에 `encodeBackupCode`·`extractBackupCode`·`decodeBackupCode`를 만든다(design 결정 1). 검증: 단위 테스트로 압축·비압축 왕복(한글·특수문자), 안내 문구·줄바꿈이 낀 메시지에서 코드 찾기, 잘린 코드 예외를 확인한다
- [x] 1.2 `importData.ts`에 `parseImportInput`(코드면 풀어서 검사, 실패 `badCode`)을 더한다(design 결정 2). 검증: 단위 테스트로 코드·공유 메시지·JSON·잘린 코드 경우를 확인한다

## 2. 화면

- [x] 2.1 설정 백업 섹션을 "백업 코드 공유"(공유 시트·코드 표시·코드 복사)와 보조 "파일로 저장"으로 바꾸고, 가져오기 입력이 `parseImportInput`을 쓰게 한다. 문구는 `messages.ts`의 `EXPORT`·`IMPORT`에 둔다(design 결정 3). 검증: 3.1 CDP

## 3. 통합 확인

- [x] 3.1 `npx tsc -b`·lint·`npm test -- --run`·`npm run build`가 통과하고, `import.mjs`에 코드 공유·복사·공유 실패·메시지 붙여넣기 가져오기·잘린 코드 항목을 더하고 `settings.mjs`를 "파일로 저장" 이름에 맞춰 고친 뒤(바꾼 줄은 보고에 적기) 기존 CDP 스크립트와 함께 통과시킨다
