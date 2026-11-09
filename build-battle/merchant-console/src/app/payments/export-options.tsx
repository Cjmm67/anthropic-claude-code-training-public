"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import type { ExportColumn, ExportScope } from "@/lib/csv"
import { Download } from "lucide-react"
import { useState } from "react"

const COLUMN_LABELS: Record<ExportColumn, string> = {
  id: "Payment ID",
  created_at: "Date (UTC)",
  merchant: "Merchant",
  description: "Description",
  status: "Status",
  method: "Method",
  card_brand: "Card brand",
  last4: "Card last four",
  amount: "Amount",
  currency: "Currency",
}

/**
 * Options for the payments export (NWP-101). Choices here are a convenience:
 * the export route validates columns and scope again on the server, and it is
 * the server that builds the file, so every matching row is included rather
 * than just the page on screen.
 */
export function ExportOptions({
  query,
  columns,
  defaultColumns,
  filteredCount,
  allCount,
}: {
  /** The current filter as a query string, without the page number. */
  query: string
  columns: readonly ExportColumn[]
  defaultColumns: readonly ExportColumn[]
  filteredCount: number
  allCount: number
}) {
  const [selected, setSelected] = useState<ExportColumn[]>([...defaultColumns])
  const [scope, setScope] = useState<ExportScope>("filtered")
  const [open, setOpen] = useState(false)

  // Every time the dialog opens it starts from the safe defaults, so last four
  // is never carried over from an earlier internal export.
  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) return
    setSelected([...defaultColumns])
    setScope("filtered")
  }

  const toggle = (column: ExportColumn) =>
    setSelected((current) =>
      current.includes(column)
        ? current.filter((c) => c !== column)
        : [...current, column],
    )

  const rowCount = scope === "all" ? allCount : filteredCount
  const ordered = columns.filter((column) => selected.includes(column))
  const canDownload = ordered.length > 0

  const download = () => {
    if (!canDownload) return
    const params = new URLSearchParams(query)
    params.set("scope", scope)
    params.set("columns", ordered.join(","))
    window.location.assign(`/api/payments/export?${params.toString()}`)
    setOpen(false)
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button variant="secondary" className="w-full gap-2 py-1.5 sm:w-fit">
          <Download
            className="-ml-0.5 size-4 shrink-0 text-gray-400 dark:text-gray-600"
            aria-hidden="true"
          />
          Export
        </Button>
      </DrawerTrigger>
      <DrawerContent className="sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>Export payments</DrawerTitle>
          <DrawerDescription>
            Choose what goes into the CSV before you download it.
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="space-y-6">
          <fieldset>
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Payments
            </legend>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="radio"
                  name="export-scope"
                  value="filtered"
                  checked={scope === "filtered"}
                  onChange={() => setScope("filtered")}
                  className="size-4 accent-blue-500"
                />
                Current filter
                <span className="text-gray-500">
                  ({filteredCount.toLocaleString()})
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="radio"
                  name="export-scope"
                  value="all"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                  className="size-4 accent-blue-500"
                />
                All payments
                <span className="text-gray-500">
                  ({allCount.toLocaleString()})
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Columns
            </legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {columns.map((column) => (
                <label
                  key={column}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    name="export-columns"
                    value={column}
                    checked={selected.includes(column)}
                    onChange={() => toggle(column)}
                    className="size-4 rounded accent-blue-500"
                  />
                  {COLUMN_LABELS[column]}
                </label>
              ))}
            </div>
            {selected.includes("last4") && (
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-500">
                Card last four is included. Do not send this file to a merchant.
              </p>
            )}
          </fieldset>
        </DrawerBody>

        <DrawerFooter className="items-center gap-2 sm:justify-between">
          <p className="text-sm text-gray-500" aria-live="polite">
            {canDownload
              ? `${rowCount.toLocaleString()} ${rowCount === 1 ? "row" : "rows"} will be exported`
              : "Select at least one column"}
          </p>
          <div className="flex gap-2">
            <DrawerClose asChild>
              <Button variant="secondary" className="py-1.5">
                Cancel
              </Button>
            </DrawerClose>
            <Button
              className="gap-2 py-1.5"
              disabled={!canDownload}
              onClick={download}
            >
              Download CSV
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
