"use client"
import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
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

const SHORTCUTS = [
  { label: "Hoje", days: 1 },
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
]

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
  const [activeShortcut, setActiveShortcut] = useState<number | null>(null)

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
    setActiveShortcut(days)
    apply({ from: nextFrom, to: nextTo })
  }

  const campaignValue = campaignId ?? "all"
  const campaignLabel = (value: string) =>
    value === "all" ? "Todas" : campaigns.find((c) => c.id === value)?.name ?? value

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dashboard-from" className="text-xs text-muted-foreground">
              De
            </Label>
            <Input
              id="dashboard-from"
              type="date"
              value={fromValue}
              onChange={(e) => {
                setFromValue(e.target.value)
                setActiveShortcut(null)
              }}
              className="w-[9.5rem]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dashboard-to" className="text-xs text-muted-foreground">
              Até
            </Label>
            <Input
              id="dashboard-to"
              type="date"
              value={toValue}
              onChange={(e) => {
                setToValue(e.target.value)
                setActiveShortcut(null)
              }}
              className="w-[9.5rem]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Campanha</Label>
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

        <Separator orientation="vertical" className="hidden h-8 sm:block" />

        <ButtonGroup>
          {SHORTCUTS.map((s) => (
            <Button
              key={s.days}
              type="button"
              variant={activeShortcut === s.days ? "default" : "outline"}
              onClick={() => shortcut(s.days)}
            >
              {s.label}
            </Button>
          ))}
        </ButtonGroup>

        <Button type="button" className="ml-auto" onClick={() => apply({})}>
          Aplicar
        </Button>
      </CardContent>
    </Card>
  )
}
