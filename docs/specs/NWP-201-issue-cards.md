# SPEC · NWP-201 — Issue virtual cards from the console

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** Chris Millar
**Status:** draft

## Problem

Ops asks the platform team to create virtual cards by hand, 12–20 times a week. Each one takes hours. Last month "two cards were created with the wrong spend limit because the request was in a Slack thread." The ticket asks for three things in the console: issue a card, see the cards ops has issued, and open one to check it.

## Current state

All paths are relative to `build-battle/merchant-console/`.

- `src/data/types.ts` and `src/data/store.ts:16-32`: there is **no card type and no card store**. The store holds merchants, payments, refunds, disputes and payouts.
- `src/data/generate.ts:16-35`: seed data is **generated in TypeScript**. It uses a deterministic number generator (`mulberry32`, `SEED`) anchored on `GENERATED_AT` (`:56`). The generator's own comment says it is "Not for anything that matters."
- `src/data/merchants.ts:7-`: each merchant has its own `currency` and `timezone`. For example, `mch_05` Brandt & Sohn uses EUR in Europe/Berlin.
- `src/data/queries.ts:108-118`: the lookup pattern is `paymentById`, `refundsForPayment` and similar. Card lookups will sit beside them.
- `src/lib/money.ts`: `formatMoney` (`:15`) is the only formatter. `parseAmountToMinorUnits` (`:46`) converts client input such as "250.00" into minor units "at the boundary only".
- `src/lib/dates.ts`: `formatDate` (`:31`) formats dates in UTC for tables. `formatInZone` (`:22`) formats in the merchant's timezone for detail pages.
- `src/app/payments/page.tsx` and `src/app/payments/[id]/page.tsx`: these set the list and detail patterns. The list is a server component using `Table`. The detail page uses a `<dl>` grid and a timeline built from events and shown with `formatInZone`.
- `src/components/ui/payments/StatusBadge.tsx:5-50`: one badge with a label, dot and variant map for each status. Card statuses will extend it rather than get a second badge.
- `src/components/ui/navigation/AppSidebar.tsx:26-51` and `src/app/siteConfig.ts:5-10`: the navigation links. Cards will be added to both.
- `src/components/`: has `Drawer`, `Input`, `Select`, `Button` and `Badge`.

**Where the docs don't match the code**

- `merchant-console/CLAUDE.md` says "Seed data is JSON". **There is no JSON.** Seed data comes from `src/data/generate.ts`, so the demo cards will be added there.
- `.claude/rules/components.md` names a `Dialog` component. **It doesn't exist.** The issue form will use `Drawer`, which is built on the same Radix dialog.
- No route handler in the repo accepts writes or returns an error yet (`src/app/api/payments/*` only reads), so there is no existing error shape to match. This spec defines `{ error: string }` with a meaningful status code.
- The ticket says 45 minutes. `build-battle/README.md` says 40.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units. A `$250.00` limit is `25000`." | Ticket rule 1; CLAUDE.md #1 | Limits drift, and the 80% threshold is wrong |
| "Generated numbers use the `4242` test BIN and a valid Luhn check digit" | CLAUDE.md card rules; ticket rule 4 | A number that looks real, or fails validation |
| "Generate on the server. A card number produced in the browser is a bug." | `.claude/rules/cards.md` | The number is exposed to the client before it is issued |
| "The full number appears in the creation response and nowhere else… not left in client state after the success screen closes. Mask everywhere else as `•••• 4242`." | `.claude/rules/cards.md` | A PAN leak, which breaks ORG-STANDARDS #8 |
| "Store the last four and the generated number's reference." | Ticket rule 2 | The full number can be read back again |
| "`active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal. Guard the transition on the server." | `.claude/rules/cards.md`; ticket rule 3 | A cancelled card comes back to life |
| "Reject a missing merchant, a zero or negative limit, a limit above 5,000,000 minor units, and any currency outside `USD`, `EUR`, `GBP`." | Ticket core | Bad cards, which is the incident the ticket describes |
| "Validate on the server… before it reaches… the store" | CLAUDE.md #4; ORG-STANDARDS #7 | Bad input reaches the store because only the client checked it |
| "Storage… UTC. Display converts to the merchant's timezone." | CLAUDE.md #2 | Wrong created date for Berlin merchants |

## Approach

**Library and types.**
- Add `Card` and `CardStatus` types, plus a `cards` array in the store.
- A new `src/lib/cards.ts` holds the logic that has to be right and tested:
  - the Luhn check digit
  - `generateCardNumber`: `4242` plus random digits from Node's `crypto`, not the seed PRNG
  - masking
  - the allowed-transition table
  - `parseIssueCardInput`, which validates the issue form. It converts the limit once with `parseAmountToMinorUnits`, checks it is between 1 and 5,000,000, checks the currency is USD, EUR or GBP, checks the merchant exists, and checks the category against an allowlist.

**Route handlers.**
- `POST /api/cards` validates the input, generates the number, stores only `last4` and a `numberRef`, and returns the full number in this one response.
- An idempotency key sent from the form makes a double-click return the existing card **without** the number.
- `GET /api/cards/[id]` returns the masked card.
- `PATCH /api/cards/[id]` applies a status change through the transition guard and returns a 409 for an illegal move.
- Every change appends to a per-card `events` history (issued, frozen, unfrozen, cancelled), with a UTC timestamp.

**Pages.**
- `/cards` is a server-rendered `Table` with an "Issue card" `Drawer`. The drawer defaults the currency to the merchant's and warns when it doesn't match (decided with the engineer). It shows the number on a success view that clears it on close.
- Freezing and unfreezing in the list call `PATCH`, then `router.refresh()`.
- `/cards/[id]` shows the record, a spend bar (amber past 80%) and the event history in the merchant's timezone.

**Demo data.** A few demo cards with spend-to-date are seeded deterministically in `generate.ts`, as agreed with the engineer. New cards start with 0 spend.

**Considered and rejected:**
- **A separate `CardStatusBadge`.** It would be a second badge implementation, so `StatusBadge` is extended instead.
- **Generating numbers with the seed PRNG.** It's deterministic, and its comment says it is "not for anything that matters."
- **Rejecting a merchant/currency mismatch on the server.** That is stricter than the ticket's written rule, so the form warns instead.
- **A database.** That's NWP-203.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | Change | `Card`, `CardStatus`, `CardCategory` and `CardEvent` types |
| `src/data/store.ts` | Change | `cards: Card[]`, plus an idempotency-key map |
| `src/data/generate.ts` | Change | Deterministic demo cards with spend. Last four and reference only |
| `src/data/queries.ts` | Change | `listCards`, `cardById` |
| `src/lib/cards.ts` | Add | Luhn, number generation, masking, transitions, input validation |
| `src/lib/cards.test.ts` | Add | Unit tests beside the code (stretch: tests) |
| `src/app/api/cards/route.ts` | Add | `GET` (masked list) and `POST` (issue, reveal once) |
| `src/app/api/cards/[id]/route.ts` | Add | `GET` (masked) and `PATCH` (guarded status change) |
| `src/app/cards/page.tsx` | Add | List, with a written empty state |
| `src/app/cards/issue-card.tsx` | Add | Client `Drawer` form, success reveal and error display |
| `src/app/cards/card-actions.tsx` | Add | Client freeze, unfreeze and cancel buttons |
| `src/app/cards/[id]/page.tsx` | Add | Detail, spend bar and event history |
| `src/components/ui/payments/StatusBadge.tsx` | Change | Add `active`, `frozen` and `cancelled` |
| `src/app/siteConfig.ts`, `src/components/ui/navigation/AppSidebar.tsx` | Change | Cards navigation link |

## Plan

1. **`src/lib/cards.ts` and tests.** Done when `npm test` passes tests for: the Luhn digit, generated numbers (start `4242`, 16 digits, pass Luhn), masking, every allowed and forbidden transition, and every validation rejection.
2. **Types, store and seed cards.** Done when `tsc` is clean and the seed cards exist at boot.
3. **API routes.** Done when `curl` shows:
   - `POST` returns a 201 with the number once
   - the same idempotency key returns the same card with no number
   - each invalid input returns a 400
   - `GET` never contains a full number
   - `PATCH` from cancelled to active returns a 409
4. **`/cards` list, navigation and issue drawer.** Done when issuing in the browser shows the number once, closing clears it, and the card appears in the list.
5. **Freeze, unfreeze and cancel actions.** Done when the status changes without a full reload and a cancelled card shows no actions.
6. **`/cards/[id]` detail.** Done when a seed card above 80% spend shows an amber bar and the history lists its events.
7. **Run `/ship-ready`, `npm test` and lint.**

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card | Browser: fill the drawer, submit, see the success view, then the new row in the list |
| Card list | `/cards` shows nickname, merchant, `•••• 1234`, formatted limit, status badge and UTC date |
| Card detail | `/cards/<id>` shows the full record and spend against the limit |
| Generated numbers | `cards.test.ts`: starts with `4242`, passes Luhn, 1,000 generated numbers all valid |
| Reveal once, mask forever | `curl` GET list and detail: `grep` finds no 16-digit run. The duplicate `POST` has no number. The browser success view is the only place the number appears, and it's gone after closing |
| Server-side validation | `cards.test.ts` covers each rejection. `curl` gets a 400 with `{ error }` for a missing merchant, 0, -1, 5,000,001, and `JPY` |
| State machine | `cards.test.ts` covers the transition table. `curl` PATCH from cancelled to active returns a 409 |
| Stretch: freeze, spend bar, category, tests, empty and error states | Browser checks plus `npm test` |

## Risks

- **Clock.** 45 minutes is tight. Core steps 1–4 come first. Category lock and polish come last and can be dropped.
- **Dev-server reloads.** Reloading could reset or duplicate cards. The store already lives on `globalThis` (`store.ts:24-38`), so cards go in the same object.
- **Status changes from two tabs.** These could race. The server guard is the authority, and a 409 is shown as a written error.

## Out of scope

- A database or persistence (NWP-203)
- Editing a limit after the card is issued (NWP-202)
- Authentication and roles
- Real card network calls
- Recording actual card spend: seeded values only

## Open questions

- **What `numberRef` should be.** The plan is an opaque id such as `tok_…`, with the full number discarded after the response, because there is no vault here.
- **Whether cancelling needs a confirmation step.** The plan is yes, a confirm step, because cancelling is irreversible.
- **Which merchant categories exist.** None exist in the codebase. The plan is a small allowlist taken from the ticket: software subscriptions, advertising, contractor tools, travel and office supplies.
