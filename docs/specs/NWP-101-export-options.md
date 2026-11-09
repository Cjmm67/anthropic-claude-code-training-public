# SPEC · NWP-101 — Payments export: let ops choose columns and scope

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-101-export-options.md`

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** Chris Millar
**Status:** done

## Problem

Ops exports the payments table several times a day for merchant queries, month-end reconciliation and Finance requests, but "every column, current filter only, no say in what comes out." Card last-four is in every file, so anything sent to a merchant is cleaned by hand: 3–4 hours a month, plus a near-miss where an unedited file nearly went to the wrong merchant.

## Current state

All paths are relative to `build-battle/merchant-console/`.

- `src/app/payments/page.tsx:68-76` — the Export button is a plain link to `/api/payments/export?<current query>`. There is no dialog and no options.
- `src/app/api/payments/export/route.ts:11-25` — the route calls `parseFilters`, `filterPayments`, `sortPayments` and `toCsv(rows)`. It already exports **every filtered row, not one page**, because it never calls `paginate`. The column set is the full default, and the filename is `exportFilename()` with no scope.
- `src/data/queries.ts:18-35` — `parseFilters` is the allowlist for status, sort and direction. `queries.ts:45-69` holds `filterPayments`, and `:102` holds `queryPayments` (filter, sort and paginate, returning `total`). This is the one query builder.
- `src/lib/csv.ts:13-24` — `EXPORT_COLUMNS` is already the full allowlist of 10 columns. `toCsv(payments, columns)` at `:58` already accepts a column subset. `cell()` at `:51-54` formats `amount` with `formatMoney` and writes `currency` as its own column.
- `src/lib/csv.ts:69` — `exportFilename(date)` returns `payments-YYYY-MM-DD.csv`, using the UTC date.
- `src/lib/csv.test.ts` — the existing tests pin escaping, column order and `"$250.00"`. Its header says that "these should still pass afterwards."
- `src/lib/money.ts:15` — `formatMoney` is the only formatter. Reuse it.
- `src/components/Drawer.tsx` — an accessible panel built on `@radix-ui/react-dialog`. It has a title, focus trapping and closes on Escape.

**Where the ticket or the rules don't match the code**

- The ticket says "Do not interpolate them into SQL." **There is no SQL.** Data lives in an in-memory store (`src/data/store.ts`). The rule still applies in spirit: column names must pass the `EXPORT_COLUMNS` allowlist before they reach the serializer or the filename.
- `.claude/rules/components.md` says a `Dialog` component exists. **It does not.** `src/components/` has `Drawer`, but no `Dialog` and no `Checkbox`.
- `src/app/payments/page.tsx:36-43` builds its own filters instead of calling `parseFilters`. It drops `from`, `to`, `sort` and `direction`, while the export route honours them. The row count the page shows could therefore differ from what downloads.
- `src/data/queries.ts:80-81` sorts by amount as **strings**, so `9000` sorts above `25000`. This is a real bug that changes row order in exports, but this ticket doesn't cover it.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units… Format once, at the edge, next to its currency code." | `merchant-console/CLAUDE.md` | Rounding drift. A second formatter disagrees with the table |
| "Anything from the client — column names… — is checked against an allowlist before it reaches a query, a filename, or the store." | `merchant-console/CLAUDE.md` | Arbitrary text in the CSV header or the `content-disposition` filename |
| "Payment filtering goes through the builder behind `GET /api/payments`. A second implementation is a bug." | `merchant-console/CLAUDE.md` | The export and the table disagree on which rows match |
| "Building this in the browser exports the current page only." | Ticket notes | Silent data loss: 20 rows instead of all |
| "Card numbers are masked everywhere except the single creation response." | `docs/ORG-STANDARDS.md:34` | Last-four leaks to merchants, which is the near-miss the ticket describes |
| "Return the same error shape everywhere… a message safe to show a user." | `.claude/rules/api-routes.md` | The UI can't explain a rejected request |

## Approach

Keep generation on the server, in the existing route. The route accepts two new query parameters on top of the current filters. `scope` is either `filtered` (the default) or `all`. `columns` is a comma-separated list. A new `parseExportColumns` helper in `src/lib/csv.ts` validates `columns` against `EXPORT_COLUMNS`. Unknown or empty input gets a 400 with a safe message. Valid input is de-duplicated and kept in canonical order. `scope=all` runs the same `filterPayments` call with filters parsed from empty params, so it still goes through the one query builder. `exportFilename` gains a scope label: `all`, the validated status, or `filtered` when only merchant or search filters are set. This choice is confirmed with the engineer. Client text never reaches the filename. On the page, a client `ExportOptions` component in a `Drawer` holds the column checkboxes (all except `last4` checked by default) and the scope choice. It shows the row count for the chosen scope. Download is a link to the route that is disabled when no column is selected. Both counts are computed server-side in `page.tsx` with `queryPayments` and passed in as props, so no extra fetch is needed.

**Considered and rejected:** fetching `GET /api/payments` pages and building the CSV in the browser. It exports the current page only (see the ticket notes), it duplicates `toCsv`, and it puts the column allowlist in the client, where it can't be enforced. Also rejected: adding a new `Dialog.tsx`. `Drawer` already wraps the same Radix dialog with the required accessibility, and the rules say to use what is there.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/csv.ts` | Change | Add `parseExportColumns` (allowlist) and `DEFAULT_EXPORT_COLUMNS` (without `last4`). Add a scope label to `exportFilename` |
| `src/lib/csv.test.ts` | Change | Extend with tests for the parser, defaults and filename. Existing tests stay untouched |
| `src/app/api/payments/export/route.ts` | Change | Read and validate `scope` and `columns`. Return a 400 on invalid input. Pass the scope to the filename |
| `src/app/payments/page.tsx` | Change | Use `parseFilters` so the page count matches the export. Compute the all-payments total. Render `ExportOptions` in place of the bare link |
| `src/app/payments/export-options.tsx` | Add | Client component: `Drawer`, labelled checkboxes, scope radio buttons, row count, disabled Download |

## Plan

1. **Column parser and defaults in `csv.ts`, test first.** Done when the new tests in `csv.test.ts` pass and the existing ones still pass under `npm test`.
2. **Scope-aware `exportFilename`.** Done when tests give `payments-disputed-2026-08-13.csv`, `payments-all-…` and `payments-filtered-…`.
3. **Route accepts `scope` and `columns`.** Done when `curl` with `columns=id,amount` returns two columns, `columns=id,evil` returns a 400 with a message, `scope=all` returns every row, and the `content-disposition` filename matches.
4. **`page.tsx` uses `parseFilters` and computes both totals.** Done when the footer count is unchanged for normal URLs.
5. **`ExportOptions` drawer.** Done when it opens from Export, `last4` starts unchecked, the count changes with scope, and Download is disabled with no columns.
6. **Browser check of the downloaded file.** Done when the filtered and all-payments files match the counts shown, and no `last4` column appears by default.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Choose columns, last-four off by default | Unit test that `DEFAULT_EXPORT_COLUMNS` excludes `last4`. A manual download with the defaults has no `last4` header |
| Choose scope, current filter by default, row count visible | Open the drawer on `/payments?status=disputed`. The count equals the footer total. Switching to all shows the store total. The CSV line count minus 1 equals the shown count |
| Filename reflects scope and date | Unit tests for `exportFilename`. `curl -I` shows the `content-disposition` header |
| Amounts in minor units, formatted once, currency separate | The existing `csv.test.ts` money tests still pass. A code review confirms only `cell()` calls `formatMoney` |
| No columns disables Download | Manual: untick every column and Download is disabled. Server: `columns=` returns a 400, so an empty file is never produced |
| Server-side validation | Unit test: `parseExportColumns` rejects unknown names. `curl` with a bad column returns a 400 |

## Risks

- Changing `page.tsx` to use `parseFilters` could change which rows the table shows for URLs with `from`, `to` or `sort`. I'll check that the default view and status filters are unchanged.
- `scope=all` loads every payment into one response. That's fine for in-memory seed data, but streaming would be its own ticket.
- The amount column keeps `formatMoney` output (`$1,234.56`, quoted). That's correct per the existing tests, but Finance spreadsheets may want plain decimals. See the open questions.

## Out of scope

- Fixing the string-based amount sort in `src/data/queries.ts:80-81`. Raise it as a separate ticket.
- Validating `merchantId`, `search`, `from` and `to` in `parseFilters`. They don't reach the filename in this design.
- Saved export presets, scheduled exports and other formats (XLSX). Check `docs/tickets/BACKLOG.md` before building any of these.

## Open questions

- Should the amount column drop the currency symbol (`250.00`) now that currency has its own column? Plan: keep the current output, because the existing tests pin `$250.00`.
- Should the route remember the last column choice per user? Plan: no. The drawer resets to the safe default every time it opens, which is the point of the ticket.
