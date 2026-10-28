"use client"
import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function localISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function DashboardFilters({
  from,
  to,
  campaignId,
  campaigns,
}: {
  from: string
  to: string
  campaignId?: string
  campaigns: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [fromValue, setFromValue] = useState(from)
  const [toValue, setToValue] = useState(to)

  function apply(next: { from?: string; to?: string; campaignId?: string }) {
    const nextFrom = next.from ?? fromValue
    const nextTo = next.to ?? toValue
    const nextCampaign = next.campaignId !== undefined ? next.campaignId : campaignId
    const params = new URLSearchParams({ from: nextFrom, to: nextTo })
    if (nextCampaign) params.set("campaignId", nextCampaign)
    router.push(`${pathname}?${params.toString()}`)
  }

  function shortcut(days: number) {
    const end = new Date()
    const start = new Date(end.getTime() - (days - 1) * 86_400_000)
    const nextFrom = localISODate(start)
    const nextTo = localISODate(end)
    setFromValue(nextFrom)
    setToValue(nextTo)
    apply({ from: nextFrom, to: nextTo })
  }

  const campaignValue = campaignId ?? "all"
  const campaignLabel = (value: string) =>
    value === "all" ? "Todas" : campaigns.find((c) => c.id === value)?.name ?? value

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-2">
        <Label htmlFor="dashboard-from">De</Label>
        <Input
          id="dashboard-from"
          type="date"
          value={fromValue}
          onChange={(e) => setFromValue(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dashboard-to">Até</Label>
        <Input
          id="dashboard-to"
          type="date"
          value={toValue}
          onChange={(e) => setToValue(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-2">
        <Label>Campanha</Label>
        <Select
          value={campaignValue}
          onValueChange={(value) => apply({ campaignId: !value || value === "all" ? "" : value })}
        >
          <SelectTrigger className="w-48">
            <SelectValue>{campaignLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {campaigns.map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => shortcut(1)}>
          Hoje
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => shortcut(7)}>
          7 dias
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => shortcut(30)}>
          30 dias
        </Button>
        <Button type="button" size="sm" onClick={() => apply({})}>
          Aplicar
        </Button>
      </div>
    </div>
  )
}
