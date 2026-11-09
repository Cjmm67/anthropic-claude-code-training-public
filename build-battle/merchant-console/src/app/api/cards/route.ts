import { issueCard, listCards } from "@/data/cards"
import { parseIssueCardInput } from "@/lib/cards"
import { NextRequest, NextResponse } from "next/server"

/** Every issued card. Records hold the last four only, never a full number. */
export function GET() {
  return NextResponse.json({ cards: listCards() })
}

/**
 * Issue a card. The full number is in this response and nowhere else. A
 * repeated `idempotencyKey` returns the existing card, without the number.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Send the card details as JSON." },
      { status: 400 },
    )
  }

  const parsed = parseIssueCardInput(body)
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, field: parsed.field },
      { status: 400 },
    )
  }

  const result = issueCard(parsed.value)
  if (!result.created) {
    return NextResponse.json({ card: result.card, duplicate: true }, { status: 200 })
  }
  return NextResponse.json(
    { card: result.card, number: result.number },
    { status: 201, headers: { "cache-control": "no-store" } },
  )
}
