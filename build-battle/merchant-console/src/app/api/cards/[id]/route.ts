import { cardById, transitionCard } from "@/data/cards"
import { isCardStatus } from "@/lib/cards"
import { NextRequest, NextResponse } from "next/server"

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const card = cardById(id)
  if (!card) {
    return NextResponse.json({ error: "That card does not exist." }, { status: 404 })
  }
  return NextResponse.json({ card })
}

/** Change a card's status. The state machine is enforced here, not in the UI. */
export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Send the new status as JSON." }, { status: 400 })
  }

  const status = (body as { status?: unknown } | null)?.status
  if (!isCardStatus(status)) {
    return NextResponse.json(
      { error: "Status must be active, frozen, or cancelled.", field: "status" },
      { status: 400 },
    )
  }

  const result = transitionCard(id, status)
  if (!result.ok && result.reason === "not_found") {
    return NextResponse.json({ error: "That card does not exist." }, { status: 404 })
  }
  if (!result.ok) {
    const message =
      result.card?.status === "cancelled"
        ? "This card is cancelled. A cancelled card cannot be changed."
        : `This card is already ${result.card?.status}.`
    return NextResponse.json({ error: message, card: result.card }, { status: 409 })
  }
  return NextResponse.json({ card: result.card })
}
