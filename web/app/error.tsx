"use client"
import { Button } from "@/components/ui/button"
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">
        Não foi possível carregar esta página.
      </h1>
      <p>Tente novamente em instantes.</p>
      <Button onClick={reset}>Tentar novamente</Button>
    </main>
  )
}
