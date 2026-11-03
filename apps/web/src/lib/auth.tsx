import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, post, refreshSession, setSession, setUnauthorizedHandler } from './api';
import { ROLE_RANK } from './fa';

export interface Me {
  user: { id: string; name: string; email: string; isSuperAdmin: boolean };
  role: string;
  organizationId: string;
  organizations: { id: string; name: string; role: string }[];
}
interface AuthState {
  me: Me | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(d: { name: string; email: string; password: string; organizationName: string; businessType?: string }): Promise<void>;
  logout(): Promise<void>;
  switchOrg(id: string): Promise<void>;
  can(minRole: string): boolean;
}
const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const loadMe = useCallback(async () => setMe(await api<Me>('/auth/me')), []);
  useEffect(() => {
    setUnauthorizedHandler(() => { setMe(null); qc.clear(); });
    refreshSession().then(async (s) => { if (s) await loadMe().catch(() => setMe(null)); }).finally(() => setLoading(false));
  }, [loadMe, qc]);

  const value: AuthState = {
    me, loading,
    async login(email, password) { await setSession(await post('/auth/login', { email, password })); await loadMe(); },
    async register(d) { await setSession(await post('/auth/register', d)); await loadMe(); },
    async logout() { await post('/auth/logout', {}).catch(() => undefined); await setSession(null); setMe(null); qc.clear(); },
    async switchOrg(id) { if (await refreshSession(id)) { qc.clear(); await loadMe(); } },
    can: (min) => !!me && ROLE_RANK[me.role] >= ROLE_RANK[min],
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
