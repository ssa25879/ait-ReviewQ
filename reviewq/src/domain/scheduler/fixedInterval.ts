import { addDays } from '../../utils/date';
import { ALGORITHM_ID, ALGORITHM_VERSION } from './constants';
import type { CardSchedule, Scheduler } from './types';

// 단계 1~6의 복습 간격(일). stage 0은 신규·초기화
export const INTERVALS = [1, 3, 7, 14, 30, 60] as const;
const MAX_STAGE = INTERVALS.length;

export const fixedIntervalScheduler: Scheduler = {
  id: ALGORITHM_ID,
  // 같은 날 두 번째 판정은 반영하지 않고 입력 객체를 그대로 돌려준다(호출자가 참조 비교로 판단)
  schedule(state, grade, today): CardSchedule {
    if (state.lastReviewedDate === today) return state;

    const common = {
      lastReviewedDate: today,
      reviewCount: state.reviewCount + 1,
      algorithmId: ALGORITHM_ID,
      algorithmVersion: ALGORITHM_VERSION,
    };
    if (grade === 'forget') {
      return { ...state, ...common, stage: 0, dueDate: addDays(today, 1), lapseCount: state.lapseCount + 1 };
    }
    // 연체 일수와 관계없이 한 단계만 올린다
    const stage = Math.min(state.stage + 1, MAX_STAGE);
    return { ...state, ...common, stage, dueDate: addDays(today, INTERVALS[stage - 1]) };
  },
};
