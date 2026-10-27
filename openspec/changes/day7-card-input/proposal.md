# Proposal

## Why

카드는 편집 화면에서 한 장씩만 만들 수 있다. 메모장·스프레드시트에 정리해 둔 단어장을 옮기려면 같은 입력을 수십 번 반복해야 하고, 처음 연 사용자는 카드를 만들기 전까지 앱이 어떻게 동작하는지 볼 수 없다. 실기기 확인을 준비하면서도 매번 손으로 데이터를 넣어야 하는 불편이 확인됐다.

## What Changes

- **여러 장 한 번에 추가**: 덱 상세에 "여러 장 한 번에 추가"를 둔다. 한 줄에 한 장씩 `질문 / 정답`, `질문 | 정답`, 또는 스프레드시트에서 복사한 탭 구분 형식으로 붙여넣으면 미리 보기로 추가될 수와 오류 줄을 보여 주고, 올바른 줄만 카드로 만든다. 한 번에 200줄까지다.
- **예시 덱으로 둘러보기**: 카드가 하나도 없을 때 홈 첫 사용 안내에 "예시 카드로 둘러보기"를 둔다. 누르면 "예시" 과목에 영단어 덱(10장)을 만들어 바로 학습해 볼 수 있다.
- **테스트 빌드 전용 데모 데이터**: `VITE_DEMO_DATA=true`로 만든 빌드에서만 설정에 "데모 데이터 채우기"를 보여 준다. 누르면 확인 뒤 지금 데이터를 학습 기록이 있는 데모 데이터로 바꾼다(백업 가져오기와 같은 교체 경로). 기본 빌드(출시 빌드)에는 화면도 코드도 들어가지 않는다.

범위 밖: CSV 파일 가져오기, 붙여넣기에서 중복 질문 거르기, 예시 덱 종류 고르기, 카드 일괄 편집·삭제.

## Capabilities

### New Capabilities
- `bulk-card-input`: 여러 장 추가 화면 진입, 줄 해석 규칙(구분자·길이·줄 수), 미리 보기와 오류 줄, 올바른 줄만 추가.
- `sample-deck`: 첫 사용 상태의 예시 덱 만들기 동작과 결과.
- `demo-data`: 테스트 빌드 플래그, 데모 데이터 채우기의 노출 조건·확인·교체, 출시 빌드 미포함.

### Modified Capabilities
- `home-screen`: "홈 빈 상태"의 첫 사용 안내에 예시 덱 동작을 더한다.
- `content-screens`: "덱 상세"에 여러 장 추가 동작을 더한다.

## Impact

- 코드: `reviewq/src/domain/bulkCards.ts`(신설: 줄 해석), `reviewq/src/screens/CardBulk/`(신설), `reviewq/src/app/router.ts`(경로 `cardBulk`), `reviewq/src/screens/DeckDetail/DeckDetail.tsx`, `reviewq/src/domain/sampleDeck.ts`(신설), `reviewq/src/screens/Home/Home.tsx`, `reviewq/src/dev/demoData.ts`·`reviewq/src/screens/Settings/DemoSection.tsx`(신설, 플래그 빌드에서만 로드), `reviewq/.env.example`, `reviewq/src/screens/messages.ts`.
- 저장: 형식 변경 없음.
- 선행: `day7-backup-import`(데모 데이터가 `replaceAll`을 쓴다)를 먼저 구현한다.
