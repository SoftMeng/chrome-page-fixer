export type NavigationTimingResult = {
  available: true;
  url: string;
  duration: number;
  domInteractive: number;
  domContentLoaded: number;
  loadComplete: number;
  ttfb: number;
  redirect: number;
  dns: number;
  tcp: number;
  tls: number;
  serverResponse: number;
  fcp: number | null;
  note?: string;
} | {
  available: false;
  error: string;
};
