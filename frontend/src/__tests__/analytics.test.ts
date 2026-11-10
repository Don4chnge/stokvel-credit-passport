import { beforeEach, describe, expect, it, vi } from "vitest";

describe("analytics", () => {
  beforeEach(() => { vi.resetModules(); window.localStorage.clear(); vi.unstubAllEnvs(); });

  it("is a no-op when no PostHog key is configured", async () => {
    const a = await import("@/lib/analytics");
    expect(a.analyticsConfigured()).toBe(false);
    await expect(a.track("passport_shared", { scope_count: 2 })).resolves.toBeUndefined();
    await expect(a.identify("user-1", "member")).resolves.toBeUndefined();
  });

  it("does not load PostHog before the visitor consents", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const init = vi.fn();
    vi.doMock("posthog-js", () => ({ default: { init, capture: vi.fn(), identify: vi.fn() } }));
    const a = await import("@/lib/analytics");
    expect(a.analyticsConfigured()).toBe(true);
    await a.track("user_signed_up", { account_type: "member" });
    expect(init).not.toHaveBeenCalled();
  });

  it("after consent it sends allow-listed properties only and a hashed id", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const capture = vi.fn(), identify = vi.fn();
    vi.doMock("posthog-js", () => ({ default: { init: vi.fn(), capture, identify, opt_out_capturing: vi.fn(), reset: vi.fn() } }));
    const a = await import("@/lib/analytics");
    a.setConsent(true);
    await a.track("passport_shared", { scope_count: 3, member_name: "Nomvula Dlamini", amount: "500.00", reference: "EFT 123", email: "x@y.z" } as any);
    expect(capture).toHaveBeenCalledWith("passport_shared", { scope_count: 3 });
    await a.identify("3b1f-user-id", "member");
    const [distinctId, props] = identify.mock.calls[0];
    expect(distinctId).toMatch(/^[0-9a-f]{32}$/);
    expect(distinctId).not.toContain("3b1f");
    expect(props).toEqual({ role: "member" });
  });

  it("sanitise drops names, amounts, references and nested objects", async () => {
    const { sanitise } = await import("@/lib/analytics");
    expect(sanitise({ channel: "payshap_request", full_name: "A B", id_number: "9001015009087", detail: { a: 1 }, method: "provider_confirmed" }))
      .toEqual({ channel: "payshap_request", method: "provider_confirmed" });
  });
});
