# Tasks

모든 경로는 `reviewq/` 기준이다. 화면 동작 검증은 scratchpad의 CDP 스크립트(devtools dev 서버 5199, 헤드리스 Edge — PowerShell에서 node 실행, 출력 폴더는 절대 경로)로 한다. 손상·실패는 localStorage(`__ait_storage:` 접두사) 값을 바꾸거나 `localStorage.setItem`/`getItem`을 일시적으로 덮어써 만든다.

## 1. 형식 검증과 로드 결과

- [ ] 1.1 `src/infra/storage/validate.ts`에 항목 검사기와 `parseValidList`를 만든다(design 결정 1). 검증: `validate.test.ts`로 정상 항목 통과, 필드 누락·타입 오류·날짜 형식·이름 31자·질문 501자·`stage` 7·JSON 아님·목록 아님이 각각 실패함을 확인한다
- [ ] 1.2 `loadContent`·`initMeta`를 판별 유니온 결과(`ok`·`corrupt`·`readFailed`)를 돌려주는 로드로 바꾸고 `bootstrap`을 재호출 가능한 `loadApp()`으로 바꾼다(design 결정 2). 검증: memoryStorage 단위 테스트로 data-storage "손상된 카드 키"·"형식이 틀린 덱 목록"·"날짜 형식이 틀린 기록", Meta 손상, `getItems` 예외 → `readFailed`, 로드 중 저장소 쓰기 0회를 확인하고 기존 `loadContent`·`meta` 테스트를 새 결과에 맞게 고쳐 통과시킨다

## 2. 백업과 복구 동작

- [ ] 2.1 `src/infra/storage/backup.ts`에 백업 읽기·검증·하루 1회 저장을 만들고 `loadApp()`의 정상 결과에 연결한다(design 결정 3). 검증: 단위 테스트로 data-recovery "하루 첫 실행"·"손상 상태에서는 갱신하지 않음", 같은 날 재실행 시 저장 0회, 손상된 백업 → 사용 불가를 확인한다
- [ ] 2.2 `src/infra/storage/recovery.ts`에 `quarantine`·`restoreFromBackup`·`dropCorrupt`를 만든다(design 결정 4). 검증: 단위 테스트로 "격리 후 변경"(격리 키 원본 일치, 격리가 원래 키 변경보다 먼저), "격리 실패"(원래 키 불변), "백업 복구"(내용·다음 복습일 일치, 손상 로그 키 `[]`, 정상 로그 유지), "한 덱만 손상", Meta 손상 시 새 Meta 생성을 확인한다

## 3. 복구·읽기 실패 화면

- [ ] 3.1 `ContentProvider`가 로드 결과를 `status`(`loading`·`ready`·`corrupt`·`readFailed`)로 내보내고, `src/screens/Recovery/Recovery.tsx`(+CSS 모듈)와 읽기 실패 화면을 `App.tsx`에 연결한다. 문구는 `screens/messages.ts`의 `RECOVERY`에 둔다(design 결정 5·7). 검증: CDP로 카드 키를 손상시키고 새로고침 → 복구 화면·손상 1건·백업 날짜와 수·편집 버튼 없음·대화상자 없음, "백업으로 복구" → 홈과 백업 내용, `bq:quarantine:` 키에 원본 존재, 백업 키 삭제 후 손상 → 두 선택지만, "손상 항목 빼고 열기" 확인 취소 → 머묾·확인 → 해당 덱 0장·다른 덱 유지, `getItem`을 한 번 실패시키고 새로고침 → 읽기 실패 안내 → "다시 시도" → 홈, 글자 13px·터치 44px 이상을 확인한다

## 4. 저장 실패 재시도와 안내

- [ ] 4.1 `saveQueue`에 재시도 간격과 상태 알림을 추가한다(design 결정 6). 검증: vitest 가짜 타이머로 "일시적 실패"(두 번째 시도에 저장, `failed` 미발생), "계속 실패"(1·2·4초 간격 3회 후 `failed`, 이후 자동 시도 없음), 실패 후 `enqueue`·`flush`가 다시 저장하고 성공 시 `ok`, 기존 "실패 후 다음 저장" 테스트 유지를 확인한다
- [ ] 4.2 `ContentProvider`에 `saveFailed`·`retrySave()`를 더하고 `src/components/SaveErrorNotice.tsx`를 화면에 연결한다. 문구는 `SAVE_ERROR`에 둔다. 검증: CDP로 `localStorage.setItem`을 실패하게 만든 뒤 카드 수정 → 약 7초 뒤 안내 표시·편집 결과 유지·하단 버튼과 겹침 없음, 저장소를 되돌리고 "다시 시도" → 저장소에 값 반영·안내 사라짐을 확인한다

## 5. 통합 확인

- [ ] 5.1 `npx tsc -b`·`npm run lint`·`npm test -- --run`·`npm run build`가 통과하고, 기존 CDP 스크립트(crud·review·study·home·stats)가 그대로 통과한다. 새 CDP 스크립트 `recovery.mjs`를 `handoff/e2e/`에 둔다. 복구 화면·저장 실패 안내 캡처를 사용자에게 공유한다

## Workflow follow-up

- 리뷰 후 커밋·푸시하고 change를 archive한다.
- Day 6 실기기 체크리스트에 "실제 Storage 실패 시 오류 형태", "카드 3,000장 백업 저장 시간·성공 여부"를 넣는다.
