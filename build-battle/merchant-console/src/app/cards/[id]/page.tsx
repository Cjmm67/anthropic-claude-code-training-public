import { Divider } from "@/components/Divider"
import { StatusBadge } from "@/components/ui/payments/StatusBadge"
import { cardById } from "@/data/cards"
import { merchantById } from "@/data/merchants"
import { CardEvent } from "@/data/types"
import { CARD_CATEGORIES, maskCard, spendRatio } from "@/lib/cards"
import { formatInZone } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cx } from "@/lib/utils"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CardActions } from "../card-actions"

export const dynamic = "force-dynamic"

const EVENT_LABELS: Record<CardEvent["type"], string> = {
  issued: "Card issued",
  frozen: "Frozen",
  unfrozen: "Unfrozen",
  cancelled: "Cancelled",
}

/** Past this share of the limit, the spend bar turns amber. */
const SPEND_WARNING = 0.8

export default async function CardDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const card = cardById(id)
  if (!card) notFound()

  const merchant = merchantById(card.merchantId)
  const timezone = merchant?.timezone ?? "UTC"
  const ratio = spendRatio(card.spent, card.limit)
  const percent = Math.round(ratio * 100)
  const warning = ratio > SPEND_WARNING
  const remaining = Math.max(0, card.limit - card.spent)

  return (
    <div className="p-4 sm:p-6">
      <Link
        href="/cards"
        className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-50"
      >
        ← All cards
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            {card.nickname}
          </h1>
          <StatusBadge status={card.status} />
        </div>
        <CardActions cardId={card.id} nickname={card.nickname} status={card.status} />
      </div>
      <p className="mt-1 font-mono text-sm text-gray-500">
        {maskCard(card.last4)} · {card.id}
      </p>

      <Divider />

      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
        Spend
      </h2>
      <div className="mt-3 max-w-xl">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium tabular-nums text-gray-900 dark:text-gray-50">
            {formatMoney(card.spent, card.currency)} of{" "}
            {formatMoney(card.limit, card.currency)} {card.currency}
          </span>
          <span
            className={cx(
              "tabular-nums",
              warning ? "text-amber-700 dark:text-amber-500" : "text-gray-500",
            )}
          >
            {percent}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Spend against limit"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}% of the spend limit used`}
          className="mt-2"
        >
          <svg className="h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
            <rect width="100%" height="100%" className="fill-gray-100 dark:fill-gray-800" />
            <rect
              width={`${percent}%`}
              height="100%"
              className={warning ? "fill-amber-500" : "fill-blue-500"}
            />
          </svg>
        </div>
        {warning && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-500">
            Over 80% of the limit is spent.
          </p>
        )}
      </div>

      <Divider />

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Merchant">
          {merchant?.name ?? card.merchantId}
          {merchant && <span className="ml-2 text-gray-500">{merchant.country}</span>}
        </Field>
        <Field label="Card number">
          <span className="font-mono">{maskCard(card.last4)}</span>
        </Field>
        <Field label="Category lock">
          {card.category ? CARD_CATEGORIES[card.category] : "Any category"}
        </Field>
        <Field label="Spend limit">
          {formatMoney(card.limit, card.currency)} {card.currency}
        </Field>
        <Field label="Spent">
          {formatMoney(card.spent, card.currency)} {card.currency}
        </Field>
        <Field label="Remaining">
          {formatMoney(remaining, card.currency)} {card.currency}
        </Field>
        <Field label="Created (UTC)">
          <span className="font-mono text-sm">{card.createdAt}</span>
        </Field>
        <Field label={`Created (${timezone})`}>
          {formatInZone(card.createdAt, timezone)}
        </Field>
        <Field label="Number reference">
          <span className="font-mono text-sm">{card.numberRef}</span>
        </Field>
      </dl>

      <Divider />

      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
        History
      </h2>
      <ol className="mt-4 space-y-4">
        {[...card.events]
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((event, index) => (
            <li key={index} className="flex gap-3">
              <span
                className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm text-gray-900 dark:text-gray-50">
                  {EVENT_LABELS[event.type]}
                </p>
                <p className="text-sm text-gray-500">
                  {formatInZone(event.at, timezone)}
                </p>
              </div>
            </li>
          ))}
      </ol>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-50">{children}</dd>
    </div>
  )
}
