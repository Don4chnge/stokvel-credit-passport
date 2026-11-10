const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** South African rand, written the same way on every device: R 5 500,00 */
export const rand = (v: string | number | null | undefined) => {
  const [whole, cents] = Math.abs(Number(v ?? 0)).toFixed(2).split(".");
  return `${Number(v ?? 0) < 0 ? "-" : ""}R ${group(whole)},${cents}`;
};

export const randShort = (v: string | number | null | undefined) => `R ${group(String(Math.round(Number(v ?? 0))))}`;

export const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "None";

export const dayTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "None";

export const shortHash = (h?: string | null, n = 10) => (h ? `${h.slice(0, n)}…${h.slice(-6)}` : "Not on ledger");

export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const METHOD_LABEL: Record<string, string> = {
  self_reported: "Self-reported",
  manually_verified: "Verified by treasurer",
  provider_confirmed: "Confirmed by payment provider",
};
