import { afterEach, describe, expect, it } from "vitest"
import { computeDailyVolume, computeHeadline } from "./metrics"
import { Dispute, Payment, Refund } from "./types"

/**
 * NWP-102. Each block pins one root cause from the diagnosis: float
 * accumulation, local-time bucketing, refunds counted as volume, and
 * currencies summed together.
 */

let seq = 0
function payment(overrides: Partial<Payment>): Payment {
  return {
    id: `pay_t${++seq}`,
    merchantId: "mch_01",
    amount: 10_000,
    currency: "USD",
    status: "captured",
    method: "card",
    cardBrand: "visa",
    last4: "4242",
    createdAt: "2026-08-10T12:00:00.000Z",
    description: "Test",
    ...overrides,
  }
}

function refund(
  overrides: Partial<Refund> & Pick<Refund, "paymentId">,
): Refund {
  return {
    id: `re_t${++seq}`,
    amount: 1_000,
    currency: "USD",
    reason: "requested_by_customer",
    createdAt: "2026-08-11T12:00:00.000Z",
    ...overrides,
  }
}

const DAYS = ["2026-08-09", "2026-08-10", "2026-08-11"]
const day = (rows: ReturnType<typeof computeDailyVolume>, date: string) =>
  rows.find((r) => r.date === date)!

describe("integer accumulation (cents drift)", () => {
  it("sums a high-volume day exactly, in minor units", () => {
    const many = Array.from({ length: 100_000 }, () =>
      payment({ amount: 1_999 }),
    )
    const rows = computeDailyVolume(many, [], "USD", DAYS)
    expect(day(rows, "2026-08-10").captured).toBe(199_900_000)
    expect(Number.isInteger(day(rows, "2026-08-10").captured)).toBe(true)
  })
})

describe("UTC bucketing (wrong date)", () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    process.env.TZ = originalTz
  })

  it("puts 23:30 UTC on its own UTC day even on a Berlin server", () => {
    process.env.TZ = "Europe/Berlin"
    const late = payment({ createdAt: "2026-08-10T23:30:00.000Z" })
    const rows = computeDailyVolume([late], [], "USD", DAYS)
    expect(day(rows, "2026-08-10").captured).toBe(10_000)
    expect(day(rows, "2026-08-11").captured).toBe(0)
  })

  it("puts 00:30 UTC on its own UTC day even on a New York server", () => {
    process.env.TZ = "America/New_York"
    const early = payment({ createdAt: "2026-08-10T00:30:00.000Z" })
    const rows = computeDailyVolume([early], [], "USD", DAYS)
    expect(day(rows, "2026-08-10").captured).toBe(10_000)
    expect(day(rows, "2026-08-09").captured).toBe(0)
  })
})

describe("refunds (totals too high)", () => {
  const kept = payment({ amount: 10_000 })
  const fullyRefunded = payment({ amount: 4_000, status: "refunded" })
  const halfRefunded = payment({ amount: 5_000, status: "refunded" })
  const refunds = [
    refund({ paymentId: fullyRefunded.id, amount: 4_000 }),
    refund({ paymentId: halfRefunded.id, amount: 2_500 }),
  ]
  const payments = [kept, fullyRefunded, halfRefunded]

  it("subtracts refunds from gross instead of adding them", () => {
    const headline = computeHeadline(payments, refunds, [], "USD")
    expect(headline.grossVolume).toBe(19_000)
    expect(headline.refundedVolume).toBe(6_500)
    expect(headline.netVolume).toBe(12_500)
    expect(headline.netVolume).toBe(
      headline.grossVolume - headline.refundedVolume,
    )
  })

  it("charts the refund amount on the day of the refund", () => {
    const rows = computeDailyVolume(payments, refunds, "USD", DAYS)
    expect(day(rows, "2026-08-10")).toEqual({
      date: "2026-08-10",
      captured: 19_000,
      refunded: 0,
    })
    expect(day(rows, "2026-08-11").refunded).toBe(6_500)
  })

  it("does not count failed or merely authorized payments as volume", () => {
    const rows = computeDailyVolume(
      [payment({ status: "failed" }), payment({ status: "authorized" })],
      [],
      "USD",
      DAYS,
    )
    expect(day(rows, "2026-08-10").captured).toBe(0)
  })
})

describe("one currency at a time", () => {
  const usd = payment({ amount: 10_000, currency: "USD" })
  const eur = payment({ amount: 7_000, currency: "EUR", merchantId: "mch_05" })
  const dispute: Dispute = {
    id: "dp_t1",
    paymentId: eur.id,
    merchantId: "mch_05",
    amount: 7_000,
    currency: "EUR",
    reasonCode: "13.1 Merchandise Not Received",
    status: "needs_response",
    openedAt: "2026-08-11T00:00:00.000Z",
    evidenceDueAt: "2026-08-25T00:00:00.000Z",
  }

  it("never adds EUR into USD", () => {
    expect(computeHeadline([usd, eur], [], [dispute], "USD").grossVolume).toBe(
      10_000,
    )
    expect(computeHeadline([usd, eur], [], [dispute], "EUR").grossVolume).toBe(
      7_000,
    )
    const rows = computeDailyVolume([usd, eur], [], "EUR", DAYS)
    expect(day(rows, "2026-08-10").captured).toBe(7_000)
  })

  it("reports disputed amounts per currency", () => {
    expect(
      computeHeadline([usd, eur], [], [dispute], "USD").disputedAmount,
    ).toBe(0)
    expect(
      computeHeadline([usd, eur], [], [dispute], "EUR").disputedAmount,
    ).toBe(7_000)
  })
})
