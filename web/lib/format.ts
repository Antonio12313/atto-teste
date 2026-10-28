const APP_TIMEZONE = "America/Sao_Paulo"

export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value
  return date.toLocaleString("pt-BR", { timeZone: APP_TIMEZONE })
}
