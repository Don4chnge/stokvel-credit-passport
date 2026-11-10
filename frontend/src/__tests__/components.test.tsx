import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContributionRing } from "@/components/ContributionRing";
import { Explanation, FactorBreakdown } from "@/components/FactorBreakdown";
import { PassportCard } from "@/components/PassportCard";
import { Badge, Empty, Hash, Modal, Notice, SyntheticTag, TestModeTag } from "@/components/ui";

const ticks = ["on_time", "on_time", "late", "missed", "on_time"].map((state) => ({ state }));

describe("ContributionRing", () => {
  it("describes the index and the periods for screen readers", () => {
    render(<ContributionRing ticks={ticks} score={78} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Reliability index 78 out of 100. 3 on time, 1 late, 1 missed, in the last 5 periods.");
    expect(screen.getByTestId("ring-score")).toHaveTextContent("78");
  });
  it("marks a provisional index", () => {
    render(<ContributionRing ticks={ticks.slice(0, 2)} score={40} provisional />);
    expect(screen.getByText("provisional, out of 100")).toBeInTheDocument();
  });
  it("draws at least twelve seats and at most twenty-four", () => {
    const few = render(<ContributionRing ticks={ticks} score={1} />);
    expect(few.container.querySelectorAll("circle").length).toBe(2 + 12);
    const many = render(<ContributionRing ticks={Array.from({ length: 40 }, () => ({ state: "on_time" }))} score={1} />);
    expect(many.container.querySelectorAll("circle").length).toBe(2 + 24);
  });
});

describe("PassportCard", () => {
  const p = { member_name: "Test Member", passport_id: "SCP-AAAA-BBBB", is_synthetic: true, last_verified_at: "2026-10-25T09:00:00Z",
    index: { score: 84, provisional: false, model_version: "cri-1.0.0", timeline: ticks },
    totals: { total_verified: "5500.00", verified_count: 11, on_time_percentage: 91.7, participation_months: 12 } };
  it("always carries the disclaimer and the synthetic label", () => {
    render(<PassportCard p={p} verifyUrl="https://example.test/verify/X" />);
    expect(screen.getByText(/not a credit bureau score and it does not guarantee credit approval/)).toBeInTheDocument();
    expect(screen.getByText("Synthetic demo data")).toBeInTheDocument();
    expect(screen.getByTestId("passport-id")).toHaveTextContent("SCP-AAAA-BBBB");
    expect(screen.getByText("R 5 500,00")).toBeInTheDocument();
  });
  it("hides the index and totals when the member did not share them", () => {
    render(<PassportCard p={{ member_name: "Test Member", passport_id: "SCP-AAAA-BBBB" }} />);
    expect(screen.getByText("Index not shared")).toBeInTheDocument();
    expect(screen.queryByText("Total verified")).not.toBeInTheDocument();
  });
});

describe("score explanation", () => {
  it("lists every factor with its weight and points", () => {
    render(<FactorBreakdown factors={{ on_time_rate: { label: "On-time contribution rate", value: 91.67, weight: 0.35, points: 32.08 },
      recovery: { label: "Recovery after missed contributions", value: 100, weight: 0.1, points: 10 } }} />);
    expect(screen.getByText("92/100 × 35% = 32.1")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Recovery after missed contributions: 100 out of 100" })).toBeInTheDocument();
  });
  it("shows strengths and improvements", () => {
    render(<Explanation e={{ headline: "Your reliability index is 84 out of 100.", strengths: ["11 of 12 contributions paid on time."],
      improvements: ["1 contribution still waiting for verification."], notes: [] }} />);
    expect(screen.getByText("Your index is supported by:")).toBeInTheDocument();
    expect(screen.getByText("What would raise it:")).toBeInTheDocument();
  });
});

describe("ui", () => {
  it("renders readable status labels", () => {
    render(<><Badge status="under_review" /><Badge status="verified" label="Payment confirmed" /></>);
    expect(screen.getByText("Under review")).toHaveAttribute("data-status", "under_review");
    expect(screen.getByText("Payment confirmed")).toBeInTheDocument();
  });
  it("errors are announced as alerts", () => {
    render(<Notice tone="error">Email or password is incorrect.</Notice>);
    expect(screen.getByRole("alert")).toHaveTextContent("Email or password is incorrect.");
  });
  it("empty state gives direction and an action", () => {
    render(<Empty title="No contributions yet" action={<button>Make a contribution</button>}>Your first contribution appears here.</Empty>);
    expect(screen.getByRole("heading", { name: "No contributions yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make a contribution" })).toBeInTheDocument();
  });
  it("labels test mode and synthetic data", () => {
    render(<><TestModeTag /><SyntheticTag /></>);
    expect(screen.getByText("TEST MODE")).toBeInTheDocument();
    expect(screen.getByText("Synthetic demo data")).toBeInTheDocument();
  });
  it("a record with no ledger hash says so", () => {
    render(<Hash value={null} />);
    expect(screen.getByText("Not on ledger")).toBeInTheDocument();
  });
  it("modal closes from its button", () => {
    let closed = false;
    render(<Modal title="Join a stokvel" onClose={() => { closed = true; }}><p>Body</p></Modal>);
    expect(screen.getByRole("dialog", { name: "Join a stokvel" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(closed).toBe(true);
  });
});
