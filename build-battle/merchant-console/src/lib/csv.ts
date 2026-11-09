import { merchantById } from "@/data/merchants"
import { Payment, PaymentFilters } from "@/data/types"
import { formatMoney } from "./money"

/**
 * CSV export for the payments table.
 *
 * Ops chooses the columns (NWP-101). The choice arrives from the client, so it
 * is checked against EXPORT_COLUMNS by parseExportColumns before it reaches
 * the serializer. Card last four is off unless someone asks for it, because
 * these files go to merchants.
 */

export const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "merchant",
  "description",
  "status",
  "method",
  "card_brand",
  "last4",
  "amount",
  "currency",
] as const

export type ExportColumn = (typeof EXPORT_COLUMNS)[number]

/** What a fresh export includes: everything except the card last four. */
export const DEFAULT_EXPORT_COLUMNS: readonly ExportColumn[] =
  EXPORT_COLUMNS.filter((column) => column !== "last4")

/**
 * Validate a client-supplied, comma-separated column list against the
 * allowlist. Returns the columns de-duplicated and in canonical order, or null
 * when the list is empty or names anything not in EXPORT_COLUMNS.
 */
export function parseExportColumns(
  raw: string | null,
): ExportColumn[] | null {
  if (raw === null) return [...DEFAULT_EXPORT_COLUMNS]
  const requested = raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  if (requested.length === 0) return null
  const allowed = new Set<string>(EXPORT_COLUMNS)
  if (!requested.every((name) => allowed.has(name))) return null
  return EXPORT_COLUMNS.filter((column) => requested.includes(column))
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cell(payment: Payment, column: ExportColumn): string {
  switch (column) {
    case "id":
      return payment.id
    case "created_at":
      return payment.createdAt
    case "merchant":
      return merchantById(payment.merchantId)?.name ?? payment.merchantId
    case "description":
      return payment.description
    case "status":
      return payment.status
    case "method":
      return payment.method
    case "card_brand":
      return payment.cardBrand ?? ""
    case "last4":
      return payment.last4 ?? ""
    case "amount":
      return formatMoney(payment.amount, payment.currency)
    case "currency":
      return payment.currency
  }
}

export function toCsv(
  payments: Payment[],
  columns: readonly ExportColumn[] = EXPORT_COLUMNS,
): string {
  const header = columns.join(",")
  const rows = payments.map((payment) =>
    columns.map((column) => escapeCell(cell(payment, column))).join(","),
  )
  return [header, ...rows].join("\n")
}

export type ExportScope = "filtered" | "all"

/** Scope from the client: anything but "all" means the current filter. */
export function parseExportScope(raw: string | null): ExportScope {
  return raw === "all" ? "all" : "filtered"
}

/**
 * The scope part of the filename. Built only from values parseFilters has
 * already allowlisted (the status), never from merchant ids or search text.
 */
export function exportScopeLabel(
  scope: ExportScope,
  filters: PaymentFilters,
): string {
  if (scope === "all") return "all"
  if (filters.status && filters.status !== "all") return filters.status
  const narrowed = filters.merchantId || filters.search || filters.from || filters.to
  return narrowed ? "filtered" : "all"
}

/**
 * `payments-<scope>-YYYY-MM-DD.csv`, UTC date. The scope label must already be
 * validated (a status from parseFilters, "all", or "filtered"); client text
 * such as a search term never reaches a filename. With no label, the
 * pre-NWP-101 name is kept.
 */
export function exportFilename(date = new Date(), scope?: string): string {
  const day = date.toISOString().slice(0, 10)
  return scope ? `payments-${scope}-${day}.csv` : `payments-${day}.csv`
}
