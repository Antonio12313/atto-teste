"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff, LoaderCircle, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { api } from "@/lib/api"
import { safeNext } from "@/lib/safe-next"

const schema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Informe um e-mail válido.")),
  password: z
    .string()
    .min(1, "Informe sua senha.")
    .max(128, "A senha deve ter até 128 caracteres."),
})
export function LoginForm({ next }: { next: string }) {
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState("")
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  })
  const submit = handleSubmit(async (data) => {
    setError("")
    try {
      await api("/auth/login", data)
      // A full navigation also discards any pre-login Router Cache.
      window.location.assign(safeNext(next))
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível entrar. Tente novamente."
      )
    }
  })
  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-5"
      aria-busy={isSubmitting}
    >
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          disabled={isSubmitting}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p id="email-error" className="text-sm text-destructive" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            disabled={isSubmitting}
            className="pr-11"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-0 right-1"
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
            disabled={isSubmitting}
          >
            {visible ? <EyeOff /> : <Eye />}
          </Button>
        </div>
        {errors.password && (
          <p
            id="password-error"
            className="text-sm text-destructive"
            role="alert"
          >
            {errors.password.message}
          </p>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={isSubmitting}
      >
        {isSubmitting ? <LoaderCircle className="animate-spin" /> : <LogIn />}
        {isSubmitting ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  )
}
