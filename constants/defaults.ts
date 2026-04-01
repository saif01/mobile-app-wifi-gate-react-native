/** Default firewall portal base URL from SRS */
export const DEFAULT_FIREWALL_ENDPOINT = 'http://10.64.4.253:8090';

export const HTTP_TIMEOUT_MS = 20000;

export const ACTIVITY_LOG_MAX = 400;

export const STORAGE_KEYS = {
  SETTINGS_V1: 'wifigate_settings_v1',
  CRED_USER: 'wifigate_cred_user',
  CRED_PASS: 'wifigate_cred_pass',
  CRED_META: 'wifigate_cred_meta',
  SESSION_FLAG: 'wifigate_session_ok',
  BIOMETRIC_ENABLED: 'wifigate_biometric_enabled',
  MANUAL_LOGIN_DONE: 'wifigate_manual_login_once',
} as const;
