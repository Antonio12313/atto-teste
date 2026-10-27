import { expect, test } from "vitest"
import { safeNext } from "../lib/safe-next"
test.each([
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "/%5cevil.example",
  "/%2fevil.example",
  "/\nevil.example",
  "/login",
  undefined,
  ["/dashboard"],
  "/%zz",
])("bloqueia redirecionamento inválido: %s", (value) => {
  expect(safeNext(value)).toBe("/dashboard")
})
test("preserva caminho relativo, query e fragmento", () => {
  expect(safeNext("/dashboard?tab=one#top")).toBe("/dashboard?tab=one#top")
})
