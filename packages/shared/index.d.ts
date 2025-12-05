export type BootPayload = {
  apiBase: string;
  configVersion: string;
  theme: 'light' | 'dark';
  referralToken: string | null;
};
