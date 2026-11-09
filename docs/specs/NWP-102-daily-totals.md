# SPEC · NWP-102 — Merchants say yesterday's totals are wrong

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-102-daily-totals.md`

**Ticket:** [NWP-102](../tickets/NWP-102.md)
**Author:** Chris Millar
**Status:** done

## Problem

Three merchants say the dashboard's daily volume doesn't match their settlement statement:
- Two are off by a few cents on high-volume days.
- A Berlin merchant sees a whole day's volume under the wrong date.
- A merchant with heavy refunds sees totals that are too high.

Support can't reproduce it. The ticket asked for a written diagnosis before any edits. That diagnosis was done with the read-only `bug-investigator` subagent and is summarised below.

## Current state (diagnosis)

All paths are relative to `build-battle/merchant-console/`. There are three independent causes, all in `src/data/metrics.ts`, and one finding the ticket didn't ask about.

1. **Cents drift: amounts are added up as floats.** `metrics.ts:31,34` (`bucket.captured += payment.amount / 100`), rounded back at `:42-43`. The rounding error grows with the number of transactions. This breaks "Never store, compare, or accumulate an amount as a float" (`.claude/rules/money.md`).
2. **Berlin wrong date: days are grouped in server-local time.** `metrics.ts:25` (`toLocaleDateString("en-CA")` with no timezone), but the bucket keys are UTC days from `lastUtcDays`. Payments near midnight move to the neighbouring day, or are dropped at the window edges (`:27`). This breaks "Storage and bucketing are UTC… Nothing else does." (CLAUDE.md #2, ORG-STANDARDS #4).
3. **Refund-heavy totals too high: refunds are added.** Three problems:
   - `metrics.ts:53-55` adds refunded payments to gross volume.
   - `:33-34` counts the full payment amount as "refunded" (about 30% of refunds are partial, `generate.ts:108,112`).
   - It dates the refund by the payment, not the refund (`generate.ts:119-121`). `store.refunds` is never read.
4. **Not one of the reports: every currency is summed as USD.** `metrics.ts:23-35,49-55` never checks `currency`. `overview/page.tsx:29,40` and `volume-chart.tsx:18` label everything `$`. This breaks `money.md` ("Summing across currencies without converting is a bug") and the warning on `sumMinorUnits` (`src/lib/money.ts:37-40`).

Display path: `overview/page.tsx:16-17` divides by 100 a second time outside the formatter, and `volume-chart.tsx:17-19` hand-formats `$` with no cents.

Existing helpers to reuse: `utcDayKey` and `lastUtcDays` (`src/lib/dates.ts:7,39`), `sumMinorUnits`, `formatMoney` and `formatMoneyCompact` (`src/lib/money.ts`).

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units… Format once, at the edge, next to its currency code." | CLAUDE.md #1 | Cents drift (cause 1) |
| "Storage and bucketing are UTC." | CLAUDE.md #2 | Wrong day (cause 2) |
| "Every amount travels with its currency code. Summing across currencies without converting is a bug" | `money.md` | Mixed-currency totals (finding 4) |
| "Totals equal the sum of their parts. Gross, net, fees, and refunds reconcile" | ORG-STANDARDS #3 | Totals too high (cause 3) |
| "Validate on the server… currencies" | CLAUDE.md #4 | `?currency=` reaching the metrics unchecked |
| "Never edit seed data to make a failing case disappear." | CLAUDE.md | — |

## Approach

Rewrite the money paths in `src/data/metrics.ts` as pure functions that take the payments, refunds, disputes and **one currency**, so they can be tested:
- Payment volume is grouped by `utcDayKey(payment.createdAt)`.
- Refunds come from `store.refunds`, grouped by the refund's own `createdAt` and using the refund's amount.
- Totals use integer sums (`sumMinorUnits`).
- **Captured** means money that was taken: statuses `captured`, `refunded` and `disputed`, since each of these was captured first. **Net = captured − refunds**, so the figures reconcile.

The overview gets a USD / EUR / GBP switcher. It's a validated `?currency=`, defaulting to USD, and the engineer agreed to it. The headline and the chart receive minor units and the currency, and format once with `formatMoney` and `formatMoneyCompact`.

**Considered and rejected:**
- **Converting EUR and GBP into USD.** There are no exchange rates in the codebase, and inventing them would be a new source of wrong numbers.
- **Fixing payouts to match.** Payouts are built in `generate.ts:165-171` at startup, from captured payments only. Making them go through the shared query builder means restructuring how the store boots, and which definition is right is a product decision. It's recorded as a follow-up, not changed here.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/metrics.ts` | Change | Pure, per-currency, UTC, integer `dailyVolume` and `headlineMetrics`. Refunds come from `store.refunds` |
| `src/data/metrics.test.ts` | Add | Tests for each root cause |
| `src/lib/money.ts` | Change | `CURRENCIES` allowlist and `parseCurrency` |
| `src/lib/money.test.ts` | Change | Tests for `parseCurrency` |
| `src/app/overview/page.tsx` | Change | Read `?currency=`, show gross, refunds and net, drop the second `/100`, add the currency switcher |
| `src/app/overview/volume-chart.tsx` | Change | Take minor units and a currency, and format with `formatMoney` |

## Plan

1. **Write `metrics.test.ts` first, against the current code.** Done when the UTC, refund and currency tests **fail** for the reasons in the diagnosis.
2. **Rewrite `metrics.ts`.** Done when those tests pass and `npm test` is green.
3. **Add the `parseCurrency` allowlist and tests.**
4. **Overview page and chart.** Done when the browser shows `€` totals for EUR, the chart tooltip shows exact cents, and `?currency=JPY` falls back to USD.

## Verification

| Symptom | How it is proven |
| --- | --- |
| Cents drift | A test sums 100,000 payments exactly, with the integer result asserted |
| Berlin wrong date | A test with `TZ=Europe/Berlin` puts a payment at `23:30Z` on its own UTC day. The old code puts it on the next day |
| Refunds too high | A test: $100 captured plus a $40 full refund plus a $50 payment with a $25 partial refund gives net $125, with refunds on the refund date |
| Mixed currency | A test: EUR payments don't appear in USD totals |
| UI | Browser: the switcher changes symbols and totals, and an invalid currency falls back to USD |

## Risks

- **The headline "Gross volume" changes meaning.** It now excludes refunds from the net figure and is per currency. The numbers ops are used to will move, so the stat labels say what each one is.
- **Changing `TZ` inside a test** affects the rest of that test file, so the test resets it afterwards.

## Out of scope

- Payouts agreeing with the dashboard. Follow-up; see NWP-205 in the backlog.
- Currency conversion.
- The monitoring tab's rounding in `analytics.ts`.

## Found while building

- **Float accumulation did not reproduce as drift.** Summing realistic amounts as floats came out exact, even at 5 million payments. It is still fixed, because it breaks the money rule, but it doesn't explain "a few cents" on its own. The likelier visible cause is the chart, which rounded every figure to whole dollars (`volume-chart.tsx:18`, `maximumFractionDigits: 0`). It now shows exact cents with `formatMoney`.

## Open questions

- The real transaction volumes and screenshots of the two cent-off reports, to confirm they came from the chart's rounding.

- Whether "entire day" in the Berlin report is literal. The local-time grouping explains a few hours' worth, not 24. If a screenshot shows more than that, there's a second cause.
