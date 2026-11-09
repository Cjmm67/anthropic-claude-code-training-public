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
import { Input } from "@/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import type { Card, CardCategory, Currency } from "@/data/types"
import { CARD_CATEGORIES, CARD_CURRENCIES, maskCard } from "@/lib/cards"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"

type MerchantOption = { id: string; name: string; currency: Currency }

type FieldErrors = Partial<Record<string, string>>

type Phase =
  | { kind: "form" }
  | { kind: "revealed"; card: Card; number: string }
  | { kind: "duplicate"; card: Card }

const NO_CATEGORY = "none"

function newRequestKey(): string {
  return crypto.randomUUID().replace(/-/g, "")
}

/** "4242123412341234" → "4242 1234 1234 1234". */
function groupDigits(number: string): string {
  return number.replace(/(\d{4})(?=\d)/g, "$1 ")
}

/**
 * Issue a virtual card (NWP-201). Validation here is a convenience; the route
 * handler re-checks everything. The full number is held only while the
 * success view is open and is dropped the moment the drawer closes.
 */
export function IssueCard({ merchants }: { merchants: MerchantOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: "form" })
  const [nickname, setNickname] = useState("")
  const [merchantId, setMerchantId] = useState("")
  const [limit, setLimit] = useState("")
  const [currency, setCurrency] = useState<Currency | "">("")
  const [category, setCategory] = useState<CardCategory | typeof NO_CATEGORY>(NO_CATEGORY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [requestKey, setRequestKey] = useState(newRequestKey)
  const [copied, setCopied] = useState(false)
  const [confirmMismatch, setConfirmMismatch] = useState(false)

  const merchant = merchants.find((m) => m.id === merchantId)
  const currencyMismatch = merchant && currency && currency !== merchant.currency

  const reset = () => {
    setPhase({ kind: "form" })
    setNickname("")
    setMerchantId("")
    setLimit("")
    setCurrency("")
    setCategory(NO_CATEGORY)
    setErrors({})
    setFormError(null)
    setSubmitting(false)
    setRequestKey(newRequestKey())
    setCopied(false)
    setConfirmMismatch(false)
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      // Closing drops the revealed number from client state for good.
      const issued = phase.kind !== "form"
      reset()
      if (issued) router.refresh()
    }
  }

  const chooseMerchant = (id: string) => {
    setMerchantId(id)
    const chosen = merchants.find((m) => m.id === id)
    // Default to the merchant's own currency; ops can still change it.
    if (chosen) setCurrency(chosen.currency)
    setConfirmMismatch(false)
    setErrors((e) => ({ ...e, merchantId: undefined }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return

    const local: FieldErrors = {}
    if (!nickname.trim()) local.nickname = "Give the card a nickname."
    if (!merchantId) local.merchantId = "Choose the merchant this card is for."
    if (!limit.trim()) local.limit = "Enter a spend limit, like 250.00."
    if (!currency) local.currency = "Choose a currency."
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length > 0) return

    setSubmitting(true)
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nickname,
          merchantId,
          limit,
          currency,
          category: category === NO_CATEGORY ? null : category,
          idempotencyKey: requestKey,
          allowCurrencyMismatch: Boolean(currencyMismatch && confirmMismatch),
        }),
      })
      const body = await response.json().catch(() => null)

      if (response.status === 201 && body?.number) {
        setPhase({ kind: "revealed", card: body.card, number: body.number })
      } else if (response.ok && body?.duplicate) {
        setPhase({ kind: "duplicate", card: body.card })
      } else if (response.status === 400 && body?.field) {
        setErrors({ [body.field]: body.error })
      } else {
        setFormError(body?.error ?? "The card could not be issued. Try again.")
      }
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const copy = async (number: string) => {
    try {
      await navigator.clipboard.writeText(number)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button className="w-full gap-2 py-1.5 sm:w-fit">
          <Plus className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
          Issue card
        </Button>
      </DrawerTrigger>
      <DrawerContent className="sm:max-w-md">
        {phase.kind === "form" && (
          <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
            <DrawerHeader>
              <DrawerTitle>Issue a virtual card</DrawerTitle>
              <DrawerDescription>
                The card number is shown once, right after you issue it.
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody className="space-y-5">
              <Field id="card-nickname" label="Nickname" error={errors.nickname}>
                <Input
                  id="card-nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g. Google Ads"
                  maxLength={60}
                  hasError={Boolean(errors.nickname)}
                  aria-invalid={Boolean(errors.nickname)}
                  aria-describedby={errors.nickname ? "card-nickname-error" : undefined}
                />
              </Field>

              <Field id="card-merchant" label="Merchant" error={errors.merchantId}>
                <Select value={merchantId} onValueChange={chooseMerchant}>
                  <SelectTrigger
                    id="card-merchant"
                    hasError={Boolean(errors.merchantId)}
                    aria-invalid={Boolean(errors.merchantId)}
                    aria-describedby={errors.merchantId ? "card-merchant-error" : undefined}
                  >
                    <SelectValue placeholder="Choose a merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
                <Field id="card-limit" label="Spend limit" error={errors.limit}>
                  <Input
                    id="card-limit"
                    inputMode="decimal"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="250.00"
                    hasError={Boolean(errors.limit)}
                    aria-invalid={Boolean(errors.limit)}
                    aria-describedby={
                      errors.limit ? "card-limit-error" : "card-limit-hint"
                    }
                  />
                  {!errors.limit && (
                    <p id="card-limit-hint" className="mt-1 text-xs text-gray-500">
                      Up to 50,000.00
                    </p>
                  )}
                </Field>

                <Field id="card-currency" label="Currency" error={errors.currency}>
                  <Select
                    value={currency}
                    onValueChange={(value) => {
                      setCurrency(value as Currency)
                      setConfirmMismatch(false)
                    }}
                  >
                    <SelectTrigger
                      id="card-currency"
                      hasError={Boolean(errors.currency)}
                      aria-invalid={Boolean(errors.currency)}
                    >
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {currencyMismatch && (
                <div
                  role="status"
                  className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-400"
                >
                  <p>
                    {merchant.name} settles in {merchant.currency}, not {currency}.
                  </p>
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={confirmMismatch}
                      onChange={(e) => setConfirmMismatch(e.target.checked)}
                      className="size-4 accent-amber-600"
                    />
                    Yes, issue this card in {currency}
                  </label>
                </div>
              )}

              <Field id="card-category" label="Merchant category lock (optional)">
                <Select
                  value={category}
                  onValueChange={(value) => setCategory(value as CardCategory)}
                >
                  <SelectTrigger id="card-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>Any category</SelectItem>
                    {Object.entries(CARD_CATEGORIES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {formError && (
                <p
                  role="alert"
                  className="rounded-md bg-red-50 p-3 text-sm text-red-900 dark:bg-red-400/10 dark:text-red-400"
                >
                  {formError}
                </p>
              )}
            </DrawerBody>

            <DrawerFooter className="gap-2">
              <DrawerClose asChild>
                <Button type="button" variant="secondary" className="py-1.5">
                  Cancel
                </Button>
              </DrawerClose>
              <Button
                type="submit"
                className="py-1.5"
                disabled={submitting}
                isLoading={submitting}
                loadingText="Issuing…"
              >
                Issue card
              </Button>
            </DrawerFooter>
          </form>
        )}

        {phase.kind === "revealed" && (
          <div className="flex flex-1 flex-col">
            <DrawerHeader>
              <DrawerTitle>Card issued</DrawerTitle>
              <DrawerDescription>
                Copy the number now. It will not be shown again.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <p className="text-sm text-gray-500">{phase.card.nickname}</p>
              <p
                className="rounded-md border border-gray-200 p-4 text-center font-mono text-xl tabular-nums tracking-wider text-gray-900 dark:border-gray-800 dark:text-gray-50"
                aria-label="Full card number"
              >
                {groupDigits(phase.number)}
              </p>
              <Button
                type="button"
                variant="secondary"
                className="w-full py-1.5"
                onClick={() => copy(phase.number)}
              >
                {copied ? "Copied" : "Copy number"}
              </Button>
              <p role="status" className="text-sm text-gray-500">
                After you close this, the card shows as {maskCard(phase.card.last4)}.
              </p>
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button className="py-1.5">Done</Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        )}

        {phase.kind === "duplicate" && (
          <div className="flex flex-1 flex-col">
            <DrawerHeader>
              <DrawerTitle>Already issued</DrawerTitle>
              <DrawerDescription>
                This request was already submitted, so no second card was created.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {phase.card.nickname} is {maskCard(phase.card.last4)}. Its full number
                was shown when it was first issued and cannot be shown again.
              </p>
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button className="py-1.5">Done</Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-50"
      >
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}
