"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { identify, resetAnalytics } from "./analytics";

export type User = {
  id: string; email: string; full_name: string; role: "member" | "lender" | "platform_admin";
  is_synthetic: boolean; passport_id: string | null; organisation_name: string | null;
  manages_stokvels: string[]; analytics_consent: boolean;
};

type Ctx = { user: User | null; loading: boolean; refresh: () => Promise<User | null>; signOut: () => Promise<void>; setUser: (u: User | null) => void };
const AuthContext = createContext<Ctx>({ user: null, loading: true, refresh: async () => null, signOut: async () => {}, setUser: () => {} });

export const homeFor = (u: User) => (u.role === "lender" ? "/lender" : u.role === "platform_admin" ? "/admin" : "/member");

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const u = await api<User>("/auth/me");
      setUser(u);
      void identify(u.id, u.role);
      return u;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    void resetAnalytics();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, refresh, signOut, setUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
