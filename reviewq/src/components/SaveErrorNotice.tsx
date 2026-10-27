import { useContent } from '../app/contentContext';
import { SAVE_ERROR } from '../screens/messages';
import styles from './SaveErrorNotice.module.css';

// 저장이 재시도까지 모두 실패했을 때 화면 맨 위 본문 흐름 안에 보이는 안내(하단 버튼과 겹치지 않는다)
export function SaveErrorNotice() {
  const { saveFailed, retrySave } = useContent();
  if (!saveFailed) return null;
  return (
    <div className={styles.notice} role="alert">
      <p className={styles.text}>{SAVE_ERROR.body}</p>
      <button type="button" className={styles.retry} onClick={retrySave}>
        {SAVE_ERROR.retry}
      </button>
    </div>
  );
}
