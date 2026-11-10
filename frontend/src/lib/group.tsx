"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";

type Ctx = { groups: any[]; group: any | null; select: (id: string) => void; reload: () => Promise<void>; loading: boolean };
const GroupContext = createContext<Ctx>({ groups: [], group: null, select: () => {}, reload: async () => {}, loading: true });
const MANAGE = ["owner", "treasurer", "administrator"];

/** The stokvels the signed-in member manages, and the one currently selected. */
export function GroupProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = useState<any[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const all = await api<any[]>("/stokvels");
    const managed = all.filter((g) => g.my_status === "active" && MANAGE.includes(g.my_role));
    setGroups(managed);
    setId((cur) => (cur && managed.some((g) => g.id === cur) ? cur : (typeof window !== "undefined" && window.localStorage.getItem("scp_group")) || managed[0]?.id || null));
    setLoading(false);
  }, []);
  useEffect(() => { reload().catch(() => setLoading(false)); }, [reload]);

  const select = (next: string) => { setId(next); window.localStorage.setItem("scp_group", next); };
  const group = groups.find((g) => g.id === id) || groups[0] || null;
  return <GroupContext.Provider value={{ groups, group, select, reload, loading }}>{children}</GroupContext.Provider>;
}
export const useGroup = () => useContext(GroupContext);
