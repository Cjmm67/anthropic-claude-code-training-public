"use client"

import { BarChart } from "@/components/BarChart"
import type { Currency } from "@/data/types"
import { formatMoney } from "@/lib/money"

/** Values arrive in minor units and are formatted once, here, with cents. */
export function VolumeChart({
  data,
  currency,
}: {
  data: { date: string; Captured: number; Refunded: number }[]
  currency: Currency
}) {
  return (
    <BarChart
      className="mt-6 h-72"
      data={data}
      index="date"
      categories={["Captured", "Refunded"]}
      colors={["blue", "gray"]}
      valueFormatter={(value: number) => formatMoney(value, currency)}
      yAxisWidth={96}
      showLegend
    />
  )
}
