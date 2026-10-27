import { describe, expect, it } from 'vitest';
import { TEST_BANNER_AD_GROUP_ID, readFlags } from './flags';

describe('readFlags', () => {
  it('환경 변수가 없으면 모두 꺼짐·테스트 광고 ID·템플릿 코드 없음', () => {
    expect(readFlags({})).toEqual({
      adsEnabled: false,
      notificationEnabled: false,
      adGroupIds: { subjects: TEST_BANNER_AD_GROUP_ID, sessionDone: TEST_BANNER_AD_GROUP_ID },
      notificationTemplateCode: null,
    });
  });

  it("'true'일 때만 켜진다", () => {
    expect(readFlags({ VITE_ADS_ENABLED: 'true', VITE_NOTIFICATION_ENABLED: 'true' })).toMatchObject({
      adsEnabled: true,
      notificationEnabled: true,
    });
    for (const v of ['1', 'TRUE', 'yes', '', undefined]) {
      expect(readFlags({ VITE_ADS_ENABLED: v, VITE_NOTIFICATION_ENABLED: v })).toMatchObject({
        adsEnabled: false,
        notificationEnabled: false,
      });
    }
  });

  it('주입된 광고 ID·템플릿 코드는 그대로 쓰고, 빈 값은 없는 것으로 본다', () => {
    const flags = readFlags({
      VITE_AD_GROUP_ID_SUBJECTS: 'group-a',
      VITE_AD_GROUP_ID_SESSION_DONE: '  ',
      VITE_NOTIFICATION_TEMPLATE_CODE: 'tpl',
    });
    expect(flags.adGroupIds).toEqual({ subjects: 'group-a', sessionDone: TEST_BANNER_AD_GROUP_ID });
    expect(flags.notificationTemplateCode).toBe('tpl');
  });
});
