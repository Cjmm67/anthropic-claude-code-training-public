import { merchantById } from "@/data/merchants"
import { CardCategory, CardEvent, CardStatus, Currency } from "@/data/types"
import { parseAmountToMinorUnits } from "./money"

/**
 * Virtual card rules (NWP-201). Pure functions only, so this file is safe to
 * import from client components; the server supplies the randomness.
 */

/** Test BIN. Every generated number starts with it, so none can be a real PAN. */
export const CARD_BIN = "4242"
export const CARD_NUMBER_LENGTH = 16

/** Spend limit ceiling, integer minor units (50,000.00). */
export const MAX_CARD_LIMIT = 5_000_000

export const CARD_CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]

export const CARD_CATEGORIES: Record<CardCategory, string> = {
  software: "Software subscriptions",
  advertising: "Advertising",
  contractor_tools: "Contractor tools",
  travel: "Travel",
  office_supplies: "Office supplies",
}

export const NICKNAME_MAX_LENGTH = 60

/** The Luhn check digit for a number written without it. */
export function luhnCheckDigit(partial: string): number {
  let sum = 0
  for (let i = 0; i < partial.length; i++) {
    // Walking from the right, the digit next to the check digit is doubled.
    let digit = Number(partial[partial.length - 1 - i])
    if (i % 2 === 0) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return (10 - (sum % 10)) % 10
}

export function isValidLuhn(number: string): boolean {
  if (!/^\d{2,}$/.test(number)) return false
  return luhnCheckDigit(number.slice(0, -1)) === Number(number.slice(-1))
}

/**
 * A 16-digit number on the test BIN with a valid check digit.
 * `randomDigit` must return an integer 0–9; the server passes crypto.randomInt.
 */
export function generateCardNumber(randomDigit: () => number): string {
  let partial = CARD_BIN
  while (partial.length < CARD_NUMBER_LENGTH - 1) {
    partial += String(randomDigit())
  }
  return partial + String(luhnCheckDigit(partial))
}

export function maskCard(last4: string): string {
  return `•••• ${last4}`
}

/** active ⇄ frozen, either to cancelled, and cancelled is terminal. */
export const CARD_TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

export function canTransition(from: CardStatus, to: CardStatus): boolean {
  return CARD_TRANSITIONS[from].includes(to)
}

/** The history entry a legal transition records. */
export function eventForTransition(to: CardStatus): CardEvent["type"] {
  if (to === "frozen") return "frozen"
  if (to === "cancelled") return "cancelled"
  return "unfrozen"
}

export function isCardStatus(value: unknown): value is CardStatus {
  return typeof value === "string" && value in CARD_TRANSITIONS
}

/** Share of the limit spent, clamped to 0–1. Display only. */
export function spendRatio(spent: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(1, Math.max(0, spent / limit))
}

export interface IssueCardInput {
  nickname: string
  merchantId: string
  /** Integer minor units. */
  limit: number
  currency: Currency
  category: CardCategory | null
  idempotencyKey: string | null
}

export type ParseResult =
  | { ok: true; value: IssueCardInput }
  | { ok: false; field: keyof IssueCardInput; error: string }

const fail = (field: keyof IssueCardInput, error: string): ParseResult => ({
  ok: false,
  field,
  error,
})

/**
 * Validate an issue-card request from the client. The limit arrives as a
 * decimal string ("250.00") and is converted to minor units here, once.
 */
export function parseIssueCardInput(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) {
    return fail("nickname", "Send the card details as a JSON object.")
  }
  const input = body as Record<string, unknown>

  const nickname = typeof input.nickname === "string" ? input.nickname.trim() : ""
  if (!nickname) return fail("nickname", "Give the card a nickname.")
  if (nickname.length > NICKNAME_MAX_LENGTH) {
    return fail("nickname", `Keep the nickname under ${NICKNAME_MAX_LENGTH} characters.`)
  }

  const merchantId = typeof input.merchantId === "string" ? input.merchantId : ""
  if (!merchantId || !merchantById(merchantId)) {
    return fail("merchantId", "Choose the merchant this card is for.")
  }

  const limit =
    typeof input.limit === "string" ? parseAmountToMinorUnits(input.limit) : null
  if (limit === null || limit <= 0) {
    return fail("limit", "Enter a spend limit greater than zero, like 250.00.")
  }
  if (limit > MAX_CARD_LIMIT) {
    return fail("limit", "The spend limit can be at most 50,000.00.")
  }

  const currency = input.currency
  if (!CARD_CURRENCIES.includes(currency as Currency)) {
    return fail("currency", "Choose USD, EUR, or GBP.")
  }

  let category: CardCategory | null = null
  if (input.category !== undefined && input.category !== null && input.category !== "") {
    if (typeof input.category !== "string" || !(input.category in CARD_CATEGORIES)) {
      return fail("category", "Choose a category from the list.")
    }
    category = input.category as CardCategory
  }

  let idempotencyKey: string | null = null
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
    if (
      typeof input.idempotencyKey !== "string" ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(input.idempotencyKey)
    ) {
      return fail("idempotencyKey", "The request key is malformed. Reload and try again.")
    }
    idempotencyKey = input.idempotencyKey
  }

  return {
    ok: true,
    value: {
      nickname,
      merchantId,
      limit,
      currency: currency as Currency,
      category,
      idempotencyKey,
    },
  }
}
