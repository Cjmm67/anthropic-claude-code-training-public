import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from "@/components/Table"
import { StatusBadge } from "@/components/ui/payments/StatusBadge"
import { listCards } from "@/data/cards"
import { merchantById, merchants } from "@/data/merchants"
import { maskCard } from "@/lib/cards"
import { formatDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import Link from "next/link"
import { CardActions } from "./card-actions"
import { IssueCard } from "./issue-card"

// Cards change on every issue and freeze; never serve a cached list.
export const dynamic = "force-dynamic"

export default function CardsPage() {
  const cards = listCards()

  return (
    <section aria-labelledby="cards-heading">
      <div className="flex flex-col justify-between gap-2 px-4 py-6 sm:flex-row sm:items-center sm:p-6">
        <div>
          <h1
            id="cards-heading"
            className="text-lg font-semibold text-gray-900 dark:text-gray-50"
          >
            Virtual cards
          </h1>
          <p className="text-sm text-gray-500">
            Single-merchant cards with a spend limit from the moment they exist.
          </p>
        </div>
        <IssueCard
          merchants={merchants.map((m) => ({
            id: m.id,
            name: m.name,
            currency: m.currency,
          }))}
        />
      </div>

      <TableRoot className="border-t border-gray-200 dark:border-gray-800">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Card</TableHeaderCell>
              <TableHeaderCell>Merchant</TableHeaderCell>
              <TableHeaderCell>Number</TableHeaderCell>
              <TableHeaderCell className="text-right">Spend limit</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Created</TableHeaderCell>
              <TableHeaderCell>
                <span className="sr-only">Actions</span>
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {cards.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center">
                  <p className="font-medium text-gray-900 dark:text-gray-50">
                    No cards issued yet
                  </p>
                  <p className="mt-1 text-gray-500">
                    Use Issue card to create one. It appears here straight away.
                  </p>
                </TableCell>
              </TableRow>
            )}
            {cards.map((card) => (
              <TableRow key={card.id}>
                <TableCell>
                  <Link
                    href={`/cards/${card.id}`}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-500"
                  >
                    {card.nickname}
                  </Link>
                </TableCell>
                <TableCell>{merchantById(card.merchantId)?.name ?? card.merchantId}</TableCell>
                <TableCell className="font-mono tabular-nums">
                  {maskCard(card.last4)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums text-gray-900 dark:text-gray-50">
                  {formatMoney(card.limit, card.currency)}
                  <span className="ml-1 text-xs font-normal text-gray-500">
                    {card.currency}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={card.status} />
                </TableCell>
                <TableCell>{formatDate(card.createdAt)}</TableCell>
                <TableCell>
                  <CardActions
                    cardId={card.id}
                    nickname={card.nickname}
                    status={card.status}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableRoot>

      <p className="px-4 py-4 text-sm text-gray-500 sm:px-6">
        {cards.length.toLocaleString()} {cards.length === 1 ? "card" : "cards"}
      </p>
    </section>
  )
}
