import * as React from "react"
import { useNavigate, Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Eye, EyeOff, Loader2, ShieldCheck, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, ApiError } from "@/lib/api"

const registerSchema = z.object({
  name: z.string().min(1, "Name is required").min(2, "Name must be at least 2 characters"),
  email: z.string().min(1, "Email is required").email("Please enter a valid email"),
  mobile: z.string().min(10, "Mobile number must be 10 digits").max(10, "Mobile number must be 10 digits"),
  shopName: z.string().min(1, "Shop name is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Za-z]/, "Password must contain at least one letter")
    .regex(/\d/, "Password must contain at least one number"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

type RegisterFormValues = z.infer<typeof registerSchema>

export function RegisterPage() {
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const navigate = useNavigate()

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      mobile: "",
      shopName: "",
      city: "",
      state: "",
      password: "",
      confirmPassword: "",
    },
  })

  async function onSubmit(values: RegisterFormValues) {
    setSubmitting(true)
    try {
      // Call the registration API endpoint
      await api.auth.register({
        name: values.name,
        email: values.email,
        mobile: values.mobile,
        shopName: values.shopName,
        city: values.city,
        state: values.state,
        password: values.password,
      })

      toast.success("Registration successful! Please sign in to continue.")
      navigate("/login", { replace: true })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Unable to register right now. Please try again."

      toast.error(message)

      // Handle field-level errors from the server
      if (err instanceof ApiError && err.fields) {
        for (const [field, fieldMessage] of Object.entries(err.fields)) {
          if (field in form.getValues()) {
            form.setError(field as keyof RegisterFormValues, { message: fieldMessage })
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
            Join our growing network of retailers across India
          </h1>
          <p className="mt-4 text-sm text-gray-400">
            Start offering AEPS and BBPS services to your customers. Quick onboarding,
            competitive commissions, and instant settlements.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {[
              "Zero registration fee, start earning immediately",
              "AEPS cash withdrawal and balance inquiry",
              "Bharat Connect bill payments across 20+ categories",
              "Real-time commission tracking and reports",
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

          <div className="flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <Store className="size-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Create your account</h2>
              <p className="text-sm text-gray-500">Join our retailer network</p>
            </div>
          </div>

          <form className="mt-6 flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Full Name</Label>
              <Input 
                id="name" 
                type="text"
                placeholder="Your full name" 
                autoComplete="name" 
                {...form.register("name")} 
              />
              {form.formState.errors.name && (
                <p className="text-xs text-danger-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email"
                placeholder="you@example.com" 
                autoComplete="email" 
                {...form.register("email")} 
              />
              {form.formState.errors.email && (
                <p className="text-xs text-danger-500">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mobile">Mobile Number</Label>
              <Input 
                id="mobile" 
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile number" 
                autoComplete="tel" 
                {...form.register("mobile")} 
              />
              {form.formState.errors.mobile && (
                <p className="text-xs text-danger-500">{form.formState.errors.mobile.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shopName">Shop Name</Label>
              <Input 
                id="shopName" 
                type="text"
                placeholder="Your shop or business name" 
                autoComplete="organization" 
                {...form.register("shopName")} 
              />
              {form.formState.errors.shopName && (
                <p className="text-xs text-danger-500">{form.formState.errors.shopName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="city">City</Label>
                <Input 
                  id="city" 
                  type="text"
                  placeholder="City" 
                  autoComplete="address-level2" 
                  {...form.register("city")} 
                />
                {form.formState.errors.city && (
                  <p className="text-xs text-danger-500">{form.formState.errors.city.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="state">State</Label>
                <Input 
                  id="state" 
                  type="text"
                  placeholder="State" 
                  autoComplete="address-level1" 
                  {...form.register("state")} 
                />
                {form.formState.errors.state && (
                  <p className="text-xs text-danger-500">{form.formState.errors.state.message}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
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
              <p className="text-xs text-gray-500">At least 8 characters with a letter and number</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="pr-9"
                  {...form.register("confirmPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {form.formState.errors.confirmPassword && (
                <p className="text-xs text-danger-500">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" variant="brand" className="mt-2" disabled={submitting}>
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              Create account
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
                Sign in
              </Link>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-gray-500">
            By registering, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  )
}
