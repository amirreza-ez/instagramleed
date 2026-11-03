declare const __DESKTOP__: boolean;
interface DesktopBridge {
  getServerUrl(): Promise<string>;
  setServerUrl(url: string): Promise<void>;
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string | null): Promise<void>;
  notify(title: string, body: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  version(): Promise<string>;
  checkForUpdates(): Promise<{ status: string; version?: string }>;
}
interface Window { desktop?: DesktopBridge }
