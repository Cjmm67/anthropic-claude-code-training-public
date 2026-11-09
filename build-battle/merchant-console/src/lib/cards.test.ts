import { describe, expect, it } from "vitest"
import {
  CARD_BIN,
  canTransition,
  eventForTransition,
  generateCardNumber,
  isValidLuhn,
  luhnCheckDigit,
  maskCard,
  MAX_CARD_LIMIT,
  parseIssueCardInput,
  spendRatio,
} from "./cards"

/**
 * Cards are where a bug becomes an incident: a number that is not on the test
 * BIN, a cancelled card that comes back, a limit in dollars instead of cents.
 * These pin the rules the console relies on.
 */

describe("luhnCheckDigit", () => {
  it("matches the published test number 4242 4242 4242 4242", () => {
    expect(luhnCheckDigit("424242424242424")).toBe(2)
    expect(isValidLuhn("4242424242424242")).toBe(true)
  })

  it("rejects a number with the wrong check digit", () => {
    expect(isValidLuhn("4242424242424241")).toBe(false)
  })

  it("rejects non-digits", () => {
    expect(isValidLuhn("4242-4242")).toBe(false)
  })
})

describe("generateCardNumber", () => {
  let seed = 7
  const pseudoDigit = () => (seed = (seed * 31 + 11) % 97) % 10

  it("is 16 digits on the 4242 test BIN with a valid check digit", () => {
    for (let i = 0; i < 1000; i++) {
      const number = generateCardNumber(pseudoDigit)
      expect(number).toMatch(/^4242\d{12}$/)
      expect(number.startsWith(CARD_BIN)).toBe(true)
      expect(isValidLuhn(number)).toBe(true)
    }
  })
})

describe("maskCard", () => {
  it("shows only the last four", () => {
    expect(maskCard("1234")).toBe("•••• 1234")
  })
})

describe("card status transitions", () => {
  it("allows active ⇄ frozen", () => {
    expect(canTransition("active", "frozen")).toBe(true)
    expect(canTransition("frozen", "active")).toBe(true)
  })

  it("allows either to be cancelled", () => {
    expect(canTransition("active", "cancelled")).toBe(true)
    expect(canTransition("frozen", "cancelled")).toBe(true)
  })

  it("treats cancelled as terminal", () => {
    expect(canTransition("cancelled", "active")).toBe(false)
    expect(canTransition("cancelled", "frozen")).toBe(false)
    expect(canTransition("cancelled", "cancelled")).toBe(false)
  })

  it("rejects no-op transitions", () => {
    expect(canTransition("active", "active")).toBe(false)
    expect(canTransition("frozen", "frozen")).toBe(false)
  })

  it("records the right history entry", () => {
    expect(eventForTransition("frozen")).toBe("frozen")
    expect(eventForTransition("active")).toBe("unfrozen")
    expect(eventForTransition("cancelled")).toBe("cancelled")
  })
})

describe("spendRatio", () => {
  it("is spend over limit, clamped to 0–1", () => {
    expect(spendRatio(8_000, 10_000)).toBe(0.8)
    expect(spendRatio(12_000, 10_000)).toBe(1)
    expect(spendRatio(0, 0)).toBe(0)
  })
})

describe("parseIssueCardInput", () => {
  const valid = {
    nickname: "Ad spend",
    merchantId: "mch_01",
    limit: "250.00",
    currency: "USD",
  }

  it("accepts a valid request and converts the limit to minor units", () => {
    const result = parseIssueCardInput(valid)
    expect(result).toEqual({
      ok: true,
      value: {
        nickname: "Ad spend",
        merchantId: "mch_01",
        limit: 25000,
        currency: "USD",
        category: null,
        idempotencyKey: null,
      },
    })
  })

  it("accepts the maximum limit exactly", () => {
    const result = parseIssueCardInput({ ...valid, limit: "50000.00" })
    expect(result.ok && result.value.limit).toBe(MAX_CARD_LIMIT)
  })

  it.each([
    ["a missing merchant", { ...valid, merchantId: undefined }, "merchantId"],
    ["an unknown merchant", { ...valid, merchantId: "mch_nope" }, "merchantId"],
    ["a zero limit", { ...valid, limit: "0" }, "limit"],
    ["a negative limit", { ...valid, limit: "-5" }, "limit"],
    ["a limit above 5,000,000 minor units", { ...valid, limit: "50000.01" }, "limit"],
    ["a numeric limit (floats are not trusted)", { ...valid, limit: 250 }, "limit"],
    ["a currency outside USD/EUR/GBP", { ...valid, currency: "JPY" }, "currency"],
    ["a missing nickname", { ...valid, nickname: "   " }, "nickname"],
    ["an unknown category", { ...valid, category: "casino" }, "category"],
    ["a malformed request key", { ...valid, idempotencyKey: "x" }, "idempotencyKey"],
  ])("rejects %s", (_label, body, field) => {
    const result = parseIssueCardInput(body)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.field).toBe(field)
  })

  it("rejects a body that is not an object", () => {
    expect(parseIssueCardInput(null).ok).toBe(false)
  })

  it("keeps a valid category", () => {
    const result = parseIssueCardInput({ ...valid, category: "advertising" })
    expect(result.ok && result.value.category).toBe("advertising")
  })
})
