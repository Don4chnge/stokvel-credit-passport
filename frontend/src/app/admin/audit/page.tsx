"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";
import { Loading, PageHeader } from "@/components/ui";

export default function Audit() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api("/admin/audit-logs").then(setRows).catch(() => setRows([])); }, []);
  return (
    <>
      <PageHeader title="Audit log" lead="The 100 most recent sensitive actions: sign-ins, verifications, sharing, access and administration." />
      {!rows ? <Loading /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[560px]" data-testid="audit-table">
            <thead className="border-b border-line"><tr><th className="th">When</th><th className="th">Action</th><th className="th">Entity</th><th className="th">Actor</th></tr></thead>
            <tbody className="divide-y divide-line">{rows.map((a) => <tr key={a.id}><td className="td whitespace-nowrap text-sage">{dayTime(a.created_at)}</td><td className="td font-mono text-xs">{a.action}</td>
              <td className="td text-sage">{a.entity_type || ""}</td><td className="td font-mono text-xs text-sage">{a.actor_user_id ? a.actor_user_id.slice(0, 8) : "system"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
