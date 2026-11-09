import { filterPayments, parseFilters, sortPayments } from "@/data/queries"
import {
  exportFilename,
  exportScopeLabel,
  parseExportColumns,
  parseExportScope,
  toCsv,
} from "@/lib/csv"
import { NextRequest, NextResponse } from "next/server"

/**
 * Exports the payments table as CSV (NWP-101).
 *
 * - `scope=filtered` (default) honours the active filters; `scope=all` ignores
 *   them. Both go through the one query builder and export every matching
 *   row, never just the visible page.
 * - `columns` is a comma-separated list, validated against EXPORT_COLUMNS.
 *   Omitted means the safe defaults (no card last four).
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  const columns = parseExportColumns(params.get("columns"))
  if (!columns) {
    return NextResponse.json(
      { error: "Choose at least one valid column to export." },
      { status: 400 },
    )
  }

  const scope = parseExportScope(params.get("scope"))
  // "All payments" drops every filter but keeps the requested sort order.
  const filterParams = new URLSearchParams(params)
  if (scope === "all") {
    for (const key of ["status", "merchantId", "search", "from", "to"]) {
      filterParams.delete(key)
    }
  }
  const filters = parseFilters(filterParams)
  const rows = sortPayments(
    filterPayments(filters),
    filters.sort,
    filters.direction,
  )
  const filename = exportFilename(new Date(), exportScopeLabel(scope, filters))

  return new Response(toCsv(rows, columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  })
}
