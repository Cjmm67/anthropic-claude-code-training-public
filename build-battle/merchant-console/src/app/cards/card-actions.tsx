"use client"

import { Button } from "@/components/Button"
import type { CardStatus } from "@/data/types"
import { canTransition } from "@/lib/cards"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

/**
 * Freeze, unfreeze, and cancel without a full page reload. The buttons offered
 * follow the state machine, but the route handler is what enforces it.
 * Cancelling is permanent, so it asks for a second click.
 */
export function CardActions({
  cardId,
  nickname,
  status,
}: {
  cardId: string
  nickname: string
  status: CardStatus
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [refreshing, startTransition] = useTransition()
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = pending || refreshing

  const change = async (to: CardStatus) => {
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: to }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        setError(body?.error ?? "That change did not go through. Try again.")
      }
      setConfirmingCancel(false)
      // Refresh either way: on a 409 someone else changed the card first.
      startTransition(() => router.refresh())
    } catch {
      setError("Could not reach the server. Try again.")
    } finally {
      setPending(false)
    }
  }

  if (status === "cancelled") {
    return <span className="text-sm text-gray-500">No actions</span>
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        {confirmingCancel ? (
          <>
            <Button
              variant="destructive"
              className="py-1 text-xs"
              disabled={busy}
              onClick={() => change("cancelled")}
              aria-label={`Confirm cancelling ${nickname}`}
            >
              Cancel permanently
            </Button>
            <Button
              variant="secondary"
              className="py-1 text-xs"
              disabled={busy}
              onClick={() => setConfirmingCancel(false)}
            >
              Keep card
            </Button>
          </>
        ) : (
          <>
            {canTransition(status, "frozen") && (
              <Button
                variant="secondary"
                className="py-1 text-xs"
                disabled={busy}
                onClick={() => change("frozen")}
                aria-label={`Freeze ${nickname}`}
              >
                Freeze
              </Button>
            )}
            {canTransition(status, "active") && (
              <Button
                variant="secondary"
                className="py-1 text-xs"
                disabled={busy}
                onClick={() => change("active")}
                aria-label={`Unfreeze ${nickname}`}
              >
                Unfreeze
              </Button>
            )}
            <Button
              variant="ghost"
              className="py-1 text-xs text-red-600 dark:text-red-500"
              disabled={busy}
              onClick={() => setConfirmingCancel(true)}
              aria-label={`Cancel ${nickname}`}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}
