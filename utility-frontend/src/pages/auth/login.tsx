import * as React from "react"
import { useNavigate, useLocation, Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/context/auth-context"
import { ApiError } from "@/lib/api"

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const [showPassword, setShowPassword] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: LoginFormValues) {
    setSubmitting(true)
    try {
      // The server decides the role from the credentials, so the UI never has to
      // guess which panel to open.
      const user = await login(values.email, values.password)

      toast.success(`Welcome back, ${user.name.split(" ")[0]}!`)
      const redirectTo = (location.state as { from?: string } | null)?.from
      navigate(redirectTo ?? (user.role === "admin" ? "/admin" : "/retailer"), { replace: true })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Unable to sign in right now. Please try again."

      toast.error(message)

      // Field-level errors are attached without a message so the inputs show as
      // invalid while the toast carries the single explanation.
      if (err instanceof ApiError && err.status === 401) {
        form.setError("email", { message: " " })
        form.setError("password", { message: "Invalid email or password" })
      } else if (err instanceof ApiError && err.fields) {
        for (const [field, fieldMessage] of Object.entries(err.fields)) {
          if (field === "email" || field === "password") {
            form.setError(field, { message: fieldMessage })
          }
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-black p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <img src="/utili-logo.jpeg" alt="UtiliPayHub" className="size-9 rounded-md object-cover" />
          <span className="text-lg font-semibold">UtiliPayHub</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">
            Enterprise AEPS &amp; BBPS platform for modern retail networks
          </h1>
          <p className="mt-4 text-sm text-gray-400">
            Manage retailers, track transactions, and settle commissions from a single,
            secure dashboard built for scale.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {[
              "Real-time AEPS & BBPS transaction monitoring",
              "Automated commission and settlement reports",
              "Bank-grade KYC verification workflow",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2.5 text-sm text-gray-300">
                <ShieldCheck className="size-4 shrink-0 text-brand-500" />
                {f}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500">© 2026 UtiliPayHub Pvt Ltd. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex w-full flex-col items-center justify-center bg-white px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <img src="/utili-logo.jpeg" alt="UtiliPayHub" className="size-9 rounded-md object-cover" />
            <span className="text-lg font-semibold text-gray-900">UtiliPayHub</span>
          </div>

          <h2 className="text-xl font-semibold text-gray-900">Sign in to your account</h2>
          <p className="mt-1 text-sm text-gray-500">Enter your credentials to access the platform.</p>

          <form className="mt-6 flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email"
                placeholder="you@example.com" 
                autoComplete="username" 
                {...form.register("email")} 
              />
              {form.formState.errors.email && (
                <p className="text-xs text-danger-500">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button type="button" className="text-xs font-medium text-gray-500 hover:text-gray-900">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pr-9"
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-xs text-danger-500">{form.formState.errors.password.message}</p>
              )}
            </div>

            <Button type="submit" variant="brand" className="mt-2" disabled={submitting}>
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              Sign in
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Don't have an account?{" "}
              <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
                Create account
              </Link>
            </p>
          </div>

          {/*
            Demo credentials are shown only outside production so the seeded
            accounts are discoverable during development without exposing them
            on a live deployment.
          */}
          {import.meta.env.DEV && (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-xs font-medium text-gray-700">Demo credentials</p>
              <div className="space-y-1 text-xs text-gray-600">
                <p>
                  <span className="font-medium">Admin:</span> adminutilihub@gmail.com / utilihub@admin
                </p>
                <p>
                  <span className="font-medium">Retailer:</span> retailer.demo@gmail.com / demo@retailer
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
