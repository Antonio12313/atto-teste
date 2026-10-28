"use client"
import { useState } from "react"
import { LogOut, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api, ApiError } from "@/lib/api"

export function useLogout() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  async function logout() {
    setLoading(true)
    setError("")
    try {
      await api("/auth/logout")
      window.location.assign("/login")
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        window.location.assign("/login")
        return
      }
      setError("Não foi possível sair. Tente novamente.")
      setLoading(false)
    }
  }
  return { logout, loading, error }
}

export function LogoutButton() {
  const { logout, loading, error } = useLogout()
  return (
    <div className="space-y-2">
      <Button variant="outline" disabled={loading} onClick={logout}>
        {loading ? <LoaderCircle className="animate-spin" /> : <LogOut />} Sair
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
