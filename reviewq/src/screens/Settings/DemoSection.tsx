// 테스트 빌드(VITE_DEMO_DATA=true)에서만 Settings가 동적으로 불러온다. 출시 빌드에는 들어가지 않는다
import { useRef, useState } from 'react';
import { useContent } from '../../app/contentContext';
import { useRoute } from '../../app/routeContext';
import { ConfirmDialog } from '../../components/Dialog';
import ui from '../../components/ui.module.css';
import { buildDemoDoc } from '../../dev/demoData';
import { todayLocal } from '../../utils/date';
import { newId } from '../../utils/id';
import styles from './Settings.module.css';

// 테스트 전용 화면이라 문구를 messages.ts에 두지 않는다(출시 번들에 섞이지 않게)
export default function DemoSection() {
  const { replaceAll } = useContent();
  const { back } = useRoute();
  const [confirm, setConfirm] = useState(false);
  const [failed, setFailed] = useState(false);
  const workingRef = useRef(false);

  const fill = async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    setConfirm(false);
    try {
      await replaceAll(buildDemoDoc(todayLocal(), newId));
      back(); // 설정 아래에는 항상 홈이 있다(seed)
    } catch (error) {
      console.error('[reviewq] 데모 데이터 채우기 실패', error);
      setFailed(true);
    } finally {
      workingRef.current = false;
    }
  };

  return (
    <section className={styles.section} aria-labelledby="settings-demo">
      <h2 id="settings-demo" className={styles.sectionTitle}>
        테스트용
      </h2>
      <p className={styles.hint}>테스트 빌드에서만 보이는 항목이에요.</p>
      <button type="button" className={ui.secondary} onClick={() => setConfirm(true)}>
        데모 데이터 채우기
      </button>
      {failed && (
        <p className={ui.error} role="alert">
          데모 데이터를 채우지 못했어요.
        </p>
      )}
      {confirm && (
        <ConfirmDialog
          title="데모 데이터로 바꿀까요?"
          detail="지금의 과목·단원·카드와 학습 기록이 데모 데이터로 바뀌어요. 바꾸기 전 데이터는 이 기기에 따로 보관돼요."
          confirmLabel="바꾸기"
          onConfirm={fill}
          onClose={() => setConfirm(false)}
        />
      )}
    </section>
  );
}
