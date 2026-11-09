import { lastUtcDays, utcDayKey } from "@/lib/dates"
import { sumMinorUnits } from "@/lib/money"
import { GENERATED_AT } from "./generate"
import { store } from "./store"
import { Currency, Dispute, Payment, PaymentStatus, Refund } from "./types"

/**
 * Dashboard metrics (NWP-102).
 *
 * - Money is integer minor units, summed with sumMinorUnits, never floats.
 * - Every figure is for one currency. There are no FX rates here, so EUR and
 *   GBP are never added into USD.
 * - Days are UTC days (utcDayKey), never the server's local calendar.
 * - Captured volume is money that was taken; refunds come from the refund
 *   records (their amount, their date) and are subtracted for net.
 */

/** Every one of these was captured before anything else happened to it. */
const CAPTURED_STATUSES: readonly PaymentStatus[] = [
  "captured",
  "refunded",
  "disputed",
]

export interface DailyVolume {
  date: string
  /** Captured that UTC day, minor units. */
  captured: number
  /** Refunded that UTC day, minor units. */
  refunded: number
}

export function computeDailyVolume(
  payments: Payment[],
  refunds: Refund[],
  currency: Currency,
  dayKeys: string[],
): DailyVolume[] {
  const captured = new Map<string, number[]>(dayKeys.map((d) => [d, []]))
  const refunded = new Map<string, number[]>(dayKeys.map((d) => [d, []]))

  for (const payment of payments) {
    if (payment.currency !== currency) continue
    if (!CAPTURED_STATUSES.includes(payment.status)) continue
    captured.get(utcDayKey(payment.createdAt))?.push(payment.amount)
  }
  for (const refund of refunds) {
    if (refund.currency !== currency) continue
    refunded.get(utcDayKey(refund.createdAt))?.push(refund.amount)
  }

  return dayKeys.map((date) => ({
    date,
    captured: sumMinorUnits(captured.get(date)!),
    refunded: sumMinorUnits(refunded.get(date)!),
  }))
}

export function computeHeadline(
  payments: Payment[],
  refunds: Refund[],
  disputes: Dispute[],
  currency: Currency,
) {
  const grossVolume = sumMinorUnits(
    payments
      .filter(
        (p) => p.currency === currency && CAPTURED_STATUSES.includes(p.status),
      )
      .map((p) => p.amount),
  )
  const refundedVolume = sumMinorUnits(
    refunds.filter((r) => r.currency === currency).map((r) => r.amount),
  )

  const authorized = payments.filter((p) => p.status !== "failed").length
  const authRate = payments.length ? authorized / payments.length : 0

  const openDisputes = disputes.filter(
    (d) => d.status === "needs_response" || d.status === "under_review",
  )

  return {
    currency,
    grossVolume,
    refundedVolume,
    netVolume: grossVolume - refundedVolume,
    authRate,
    paymentCount: payments.length,
    openDisputes: openDisputes.length,
    disputedAmount: sumMinorUnits(
      openDisputes.filter((d) => d.currency === currency).map((d) => d.amount),
    ),
  }
}

export function dailyVolume(currency: Currency, days = 30): DailyVolume[] {
  return computeDailyVolume(
    store.payments,
    store.refunds,
    currency,
    lastUtcDays(days, GENERATED_AT),
  )
}

export function headlineMetrics(currency: Currency = "USD") {
  return computeHeadline(
    store.payments,
    store.refunds,
    store.disputes,
    currency,
  )
}
