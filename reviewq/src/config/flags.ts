// 광고·알림 기능 플래그와 광고 ID. 빌드 환경 변수로 정하며 기본값은 모두 꺼짐이다.
// 운영 광고 그룹 ID·알림 템플릿 코드는 저장소에 두지 않고 로컬 .env.production.local로만 주입한다

export const TEST_BANNER_AD_GROUP_ID = 'ait-ad-test-banner-id';

export interface Flags {
  adsEnabled: boolean;
  notificationEnabled: boolean;
  adGroupIds: { subjects: string; sessionDone: string };
  notificationTemplateCode: string | null; // 없으면 알림 동의 버튼을 숨긴다
}

type Env = Record<string, string | boolean | undefined>;

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function readFlags(env: Env): Flags {
  return {
    adsEnabled: env.VITE_ADS_ENABLED === 'true',
    notificationEnabled: env.VITE_NOTIFICATION_ENABLED === 'true',
    // 운영 ID가 주입되지 않은 빌드(개발·QR 테스트)는 테스트 ID를 쓴다
    adGroupIds: {
      subjects: text(env.VITE_AD_GROUP_ID_SUBJECTS) ?? TEST_BANNER_AD_GROUP_ID,
      sessionDone: text(env.VITE_AD_GROUP_ID_SESSION_DONE) ?? TEST_BANNER_AD_GROUP_ID,
    },
    notificationTemplateCode: text(env.VITE_NOTIFICATION_TEMPLATE_CODE),
  };
}

export const flags = readFlags(import.meta.env);
