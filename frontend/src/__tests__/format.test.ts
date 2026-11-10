import { describe, expect, it } from "vitest";
import { METHOD_LABEL, rand, randShort, shortHash, titleCase } from "@/lib/format";

describe("rand", () => {
  it("writes rand with a space for thousands and a comma for cents", () => {
    expect(rand("500.00")).toBe("R 500,00");
    expect(rand(5500)).toBe("R 5 500,00");
    expect(rand("1234567.5")).toBe("R 1 234 567,50");
    expect(rand(null)).toBe("R 0,00");
    expect(randShort(12000)).toBe("R 12 000");
  });
  it("never loses cents to floating point display", () => {
    expect(rand("0.10")).toBe("R 0,10");
    expect(rand("999.99")).toBe("R 999,99");
  });
});

describe("labels", () => {
  it("shortens hashes and marks records without one", () => {
    expect(shortHash("a".repeat(64))).toBe("aaaaaaaaaa…aaaaaa");
    expect(shortHash(null)).toBe("Not on ledger");
  });
  it("names every verification level", () => {
    expect(Object.keys(METHOD_LABEL)).toEqual(["self_reported", "manually_verified", "provider_confirmed"]);
    expect(titleCase("under_review")).toBe("Under review");
  });
});
