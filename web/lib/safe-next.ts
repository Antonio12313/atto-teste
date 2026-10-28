export function safeNext(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return "/dashboard"
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith("//") || /[\\\u0000-\u0020]/.test(decoded))
      return "/dashboard"
    const url = new URL(value, "https://local.invalid")
    if (url.origin !== "https://local.invalid" || url.pathname === "/login")
      return "/dashboard"
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return "/dashboard"
  }
}
