"use client"
import { useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function TableControls({
  prefix,
  total,
  page,
  pageSize,
  q,
}: {
  prefix: string
  total: number
  page: number
  pageSize: number
  q?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(q ?? "")
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function go(nextPage: number, nextQ?: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(`${prefix}Page`, String(nextPage))
    if (nextQ !== undefined) {
      if (nextQ) params.set(`${prefix}Q`, nextQ)
      else params.delete(`${prefix}Q`)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative w-full max-w-56">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go(1, value)
          }}
          onBlur={() => {
            if (value !== (q ?? "")) go(1, value)
          }}
          placeholder="Buscar por nome ou login"
          className="pl-7"
        />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {total === 0
            ? "Sem resultados"
            : `Página ${page} de ${totalPages} · ${total} ${total === 1 ? "resultado" : "resultados"}`}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => go(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
