"use client"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

const chartConfig: ChartConfig = {
  answered: { label: "Atendidas", color: "var(--chart-1)" },
}

export function CallsByHourChart({ data }: { data: Array<{ hour: number; answered: number }> }) {
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="hour"
          tickFormatter={(hour: number) => `${hour}h`}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(hour) => `${hour}h`} />} />
        <Bar dataKey="answered" fill="var(--color-answered)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
