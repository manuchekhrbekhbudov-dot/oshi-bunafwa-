import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setUnauthorizedHandler } from '../lib/api';
import type { User } from '../lib/types';
import { useI18n } from '../i18n';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  /** Сервер дастрас нест (интернет нест) — на "баромадан" */
  offline: boolean;
  retry: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const ME = ['me'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { setLang, lang } = useI18n();
  const me = useQuery({
    queryKey: ME,
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>('/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  // Маълумоти корбари қаблиро тоза мекунем, вале query-и 'me'-ро нигоҳ медорем (observer пайваст мемонад)
  const resetData = useCallback(() => qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' }), [qc]);

  const setUser = useCallback(
    (u: User | null) => {
      qc.setQueryData(ME, u);
      if (u && u.language !== lang) setLang(u.language);
    },
    [qc, lang, setLang],
  );

  useEffect(() => {
    if (me.data && me.data.language !== lang) setLang(me.data.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data?.language]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.setQueryData(ME, null);
      resetData();
    });
  }, [qc, resetData]);

  const refetchMe = me.refetch;
  const retry = useCallback(() => {
    void refetchMe();
  }, [refetchMe]);

  const login = async (email: string, password: string) => {
    const r = await api.post<{ user: User }>('/auth/login', { email, password });
    resetData();
    setUser(r.user);
  };
  const register = async (name: string, email: string, password: string) => {
    const r = await api.post<{ user: User }>('/auth/register', { name, email, password, language: lang });
    resetData();
    setUser(r.user);
  };
  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.setQueryData(ME, null);
    resetData();
  };

  return (
    <Ctx.Provider
      value={{
        user: me.data ?? null,
        loading: me.isLoading,
        offline: me.data === undefined && me.error instanceof ApiError && me.error.status === 0,
        retry,
        login,
        register,
        logout,
        setUser: (u) => setUser(u),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
