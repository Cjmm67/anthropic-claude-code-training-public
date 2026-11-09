import {
  canTransition,
  eventForTransition,
  generateCardNumber,
  IssueCardInput,
} from "@/lib/cards"
import { randomBytes, randomInt } from "node:crypto"
import { store } from "./store"
import { Card, CardStatus } from "./types"

/**
 * Card reads and writes against the in-memory store (NWP-201). Server only:
 * this is where card numbers are generated, and they never leave except in
 * the creation response.
 */

/** Newest first, so a card ops just issued is at the top of the list. */
export function listCards(): Card[] {
  return [...store.cards].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function cardById(id: string): Card | null {
  return store.cards.find((card) => card.id === id) ?? null
}

export type IssueResult =
  | { created: true; card: Card; number: string }
  | { created: false; card: Card }

/**
 * Issue a card. A repeated request key returns the card it already created,
 * without the number: the reveal happens once.
 */
export function issueCard(input: IssueCardInput, now = new Date()): IssueResult {
  if (input.idempotencyKey) {
    const existingId = store.cardRequests.get(input.idempotencyKey)
    const existing = existingId ? cardById(existingId) : null
    if (existing) return { created: false, card: existing }
  }

  const number = generateCardNumber(() => randomInt(10))
  const createdAt = now.toISOString()
  const card: Card = {
    id: `card_${randomBytes(6).toString("hex")}`,
    merchantId: input.merchantId,
    nickname: input.nickname,
    last4: number.slice(-4),
    numberRef: `tok_${randomBytes(12).toString("hex")}`,
    limit: input.limit,
    spent: 0,
    currency: input.currency,
    status: "active",
    category: input.category,
    createdAt,
    events: [{ type: "issued", at: createdAt }],
  }

  store.cards.push(card)
  if (input.idempotencyKey) store.cardRequests.set(input.idempotencyKey, card.id)
  return { created: true, card, number }
}

export type TransitionResult =
  | { ok: true; card: Card }
  | { ok: false; reason: "not_found" | "invalid_transition"; card: Card | null }

/** Move a card to a new status, if the state machine allows it. */
export function transitionCard(
  id: string,
  to: CardStatus,
  now = new Date(),
): TransitionResult {
  const card = cardById(id)
  if (!card) return { ok: false, reason: "not_found", card: null }
  if (!canTransition(card.status, to)) {
    return { ok: false, reason: "invalid_transition", card }
  }
  card.status = to
  card.events.push({ type: eventForTransition(to), at: now.toISOString() })
  return { ok: true, card }
}
