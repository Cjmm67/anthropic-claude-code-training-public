import { StatusBadge } from "@/components/ui/payments/StatusBadge"
import { merchantById } from "@/data/merchants"
import { dailyVolume, headlineMetrics } from "@/data/metrics"
import { store } from "@/data/store"
import { formatDate } from "@/lib/dates"
import {
  CURRENCIES,
  formatMoney,
  formatMoneyCompact,
  parseCurrency,
} from "@/lib/money"
import { cx } from "@/lib/utils"
import Link from "next/link"
import { VolumeChart } from "./volume-chart"

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  // One currency at a time: there are no FX rates, so totals never mix them.
  const currency = parseCurrency((await searchParams).currency)
  const metrics = headlineMetrics(currency)
  const volume = dailyVolume(currency, 30)

  // Minor units go to the chart; it formats once, with the currency.
  const chartData = volume.map((day) => ({
    date: day.date.slice(5),
    Captured: day.captured,
    Refunded: day.refunded,
  }))

  const recent = [...store.payments]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)

  return (
    <div className="border-t border-gray-200 p-4 sm:p-6 dark:border-gray-800">
      <nav aria-label="Currency" className="mb-6 flex gap-2">
        {CURRENCIES.map((code) => (
          <Link
            key={code}
            href={`/overview?currency=${code}`}
            aria-current={code === currency ? "page" : undefined}
            className={cx(
              "rounded-md px-3 py-1 text-sm font-medium ring-1 ring-inset",
              code === currency
                ? "bg-blue-50 text-blue-700 ring-blue-500/30 dark:bg-blue-400/10 dark:text-blue-400"
                : "text-gray-600 ring-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:ring-gray-800",
            )}
          >
            {code}
          </Link>
        ))}
      </nav>

      <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Stat
          label={`Net volume (${currency})`}
          value={formatMoneyCompact(metrics.netVolume, currency)}
          sub={`${formatMoney(metrics.grossVolume, currency)} captured − ${formatMoney(metrics.refundedVolume, currency)} refunded · last 120 days`}
        />
        <Stat
          label="Payments"
          value={metrics.paymentCount.toLocaleString()}
          sub={`${store.disputes.length} disputes opened`}
        />
        <Stat
          label="Open disputes"
          value={String(metrics.openDisputes)}
          sub={`${formatMoney(metrics.disputedAmount, currency)} ${currency} at risk`}
        />
      </dl>

      <div className="mt-10">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
          Daily volume
        </h2>
        <p className="mt-0.5 text-sm/6 text-gray-500">
          {currency} captured against refunded, by UTC day, over the last 30 days.
        </p>
        <VolumeChart data={chartData} currency={currency} />
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
            Recent payments
          </h2>
          <Link
            href="/payments"
            className="text-sm text-blue-600 hover:underline dark:text-blue-500"
          >
            View all
          </Link>
        </div>
        <ul className="mt-2 divide-y divide-gray-200 dark:divide-gray-800">
          {recent.map((payment) => (
            <li
              key={payment.id}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/payments/${payment.id}`}
                  className="text-sm font-medium text-gray-900 hover:underline dark:text-gray-50"
                >
                  {merchantById(payment.merchantId)?.name}
                </Link>
                <p className="truncate text-sm text-gray-500">
                  {payment.description} · {formatDate(payment.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-50">
                  {formatMoney(payment.amount, payment.currency)}
                </span>
                <StatusBadge status={payment.status} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
        {value}
      </dd>
      {sub && <p className="mt-1 text-sm text-gray-500">{sub}</p>}
    </div>
  )
}
