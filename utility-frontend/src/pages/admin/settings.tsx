import * as React from "react"
import { toast } from "sonner"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  KeyRound, LogOut, Download, RefreshCw, CheckCircle2, XCircle, Loader2, Wallet,
} from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ErrorState } from "@/components/shared/error-state"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useApiQuery, useMutation } from "@/hooks/use-api"
import { useAuth } from "@/context/auth-context"
import { api, ApiError, apiBaseUrl } from "@/lib/api"
import { formatMoney } from "@/lib/money"

/** Mirrors the backend password policy in internal/auth. */
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters")
      .regex(/[A-Za-z]/, "Must contain at least one letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "The new password must be different from the current one",
    path: ["newPassword"],
  })

type PasswordFormValues = z.infer<typeof passwordSchema>

export function AdminSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Your account, the live integration status, and UAT evidence for certification"
      />

      <Tabs defaultValue="account">
        <TabsList className="flex-wrap">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="uat">UAT Evidence</TabsTrigger>
        </TabsList>

        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>
        <TabsContent value="uat">
          <UatTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AccountTab() {
  const { user, logout } = useAuth()
  const [logoutAllOpen, setLogoutAllOpen] = React.useState(false)

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  })

  const change = useMutation(
    (values: PasswordFormValues) => api.auth.changePassword(values.currentPassword, values.newPassword),
    { successMessage: "Password changed" },
  )

  const logoutAll = useMutation(() => api.auth.logoutAll(), {
    successMessage: "Signed out of all sessions",
  })

  async function onSubmit(values: PasswordFormValues) {
    const result = await change.run(values)
    if (result === undefined) return

    form.reset()
    // The backend revokes every refresh token on a password change, this session
    // included, so signing out now avoids a session that fails later.
    toast.info("Please sign in again with your new password")
    await logout()
  }

  async function confirmLogoutAll() {
    const result = await logoutAll.run()
    setLogoutAllOpen(false)
    if (result !== undefined) await logout()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Signed in as</CardTitle>
          <CardDescription>
            Name, email and role are managed on the user record. Contact your platform operator to change them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-gray-500">Name</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{user?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Email</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{user?.email ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Role</p>
              <p className="mt-1 text-sm font-medium capitalize text-gray-900">{user?.role ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Every session is signed out when the password changes. You will be asked to sign in again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  {...form.register("currentPassword")}
                />
                {form.formState.errors.currentPassword && (
                  <p className="text-xs text-danger-500">{form.formState.errors.currentPassword.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("newPassword")}
                />
                {form.formState.errors.newPassword && (
                  <p className="text-xs text-danger-500">{form.formState.errors.newPassword.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("confirmPassword")}
                />
                {form.formState.errors.confirmPassword && (
                  <p className="text-xs text-danger-500">{form.formState.errors.confirmPassword.message}</p>
                )}
              </div>
            </div>
            <div>
              <Button type="submit" variant="brand" disabled={change.pending}>
                <KeyRound className="size-3.5" /> Update Password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            Refresh tokens are stored without device fingerprints, so they can be revoked together but not listed
            individually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setLogoutAllOpen(true)} disabled={logoutAll.pending}>
            <LogOut className="size-3.5" /> Sign out of all sessions
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={logoutAllOpen}
        onOpenChange={setLogoutAllOpen}
        title="Sign out of all sessions"
        description="Every device, including this one, will be signed out."
        confirmLabel="Sign out everywhere"
        destructive
        onConfirm={() => void confirmLogoutAll()}
      />
    </div>
  )
}

/**
 * Live provider capability view.
 *
 * Reads what the provider clients report rather than a configuration flag, so the
 * panel shows what can actually be performed right now.
 */
function IntegrationsTab() {
  const query = useApiQuery(() => api.admin.integrations(), [])
  const ready = useApiQuery(() => api.health.ready(), [], { showErrorToast: false })

  const [memberId, setMemberId] = React.useState("")
  const [balance, setBalance] = React.useState<{ balance: number; raw: string } | null>(null)

  const checkBalance = useMutation((id: string) => api.admin.providerBalance(id), {
    onSuccess: (result) => setBalance(result),
  })

  if (query.error) return <ErrorState description={query.error} onRetry={query.refetch} />

  const aeps = query.data?.aeps
  const bc = query.data?.bharatConnect

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Service Health</CardTitle>
          <CardDescription>API base URL {apiBaseUrl}</CardDescription>
        </CardHeader>
        <CardContent>
          {ready.loading ? (
            <Skeleton className="h-6 w-48" />
          ) : ready.error ? (
            <Badge variant="danger" dot>Backend unreachable</Badge>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={ready.data?.status === "ok" ? "success" : "warning"} dot>
                Status {ready.data?.status}
              </Badge>
              <Badge variant={ready.data?.database === "ok" ? "success" : "danger"} dot>
                Database {ready.data?.database}
              </Badge>
              {Object.entries(ready.data?.integrations ?? {}).map(([name, state]) => (
                <Badge key={name} variant={state === "ok" ? "success" : "warning"} dot>
                  {name} {state}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AEPS</CardTitle>
            <CardDescription>
              Operations the provider client can currently perform. Transactional AEPS endpoints are not yet
              documented by the provider, so they report unavailable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {query.loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <CapabilityList
                items={[
                  ["Onboarding", aeps?.onboard],
                  ["Cash withdrawal", aeps?.cashWithdrawal],
                  ["Balance enquiry", aeps?.balanceEnquiry],
                  ["Mini statement", aeps?.miniStatement],
                  ["Aadhaar Pay", aeps?.aadhaarPay],
                  ["Status check", aeps?.statusCheck],
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bharat Connect</CardTitle>
            <CardDescription>Bill fetch and payment operations</CardDescription>
          </CardHeader>
          <CardContent>
            {query.loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <CapabilityList
                items={[
                  ["Token generation", bc?.token],
                  ["Balance", bc?.balance],
                  ["Plans", bc?.plans],
                  ["Validation", bc?.validation],
                  ["View bill", bc?.viewBill],
                  ["Payment", bc?.payment],
                  ["Status check", bc?.status],
                  ["Credit card bill", bc?.creditCardBill],
                ]}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provider Balance Check</CardTitle>
          <CardDescription>
            Calls the Bharat Connect retailer-balance endpoint live. Useful for confirming the encryption channel
            and credentials end to end.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memberId">Member ID</Label>
              <Input
                id="memberId"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                placeholder="Provider-issued member ID"
                className="w-72"
              />
            </div>
            <Button
              variant="outline"
              disabled={checkBalance.pending || memberId.trim() === ""}
              onClick={() => {
                setBalance(null)
                void checkBalance.run(memberId.trim())
              }}
            >
              {checkBalance.pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wallet className="size-3.5" />
              )}
              Check Balance
            </Button>
          </div>

          {balance && (
            <div className="rounded-md border border-gray-200 px-4 py-3">
              <p className="text-xs font-medium text-gray-500">Reported balance</p>
              <p className="table-num text-lg font-semibold text-gray-900">
                {formatMoney(balance.balance)}
              </p>
              <p className="mt-2 break-all text-[11px] text-gray-400">{balance.raw}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CapabilityList({ items }: { items: [string, boolean | undefined][] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map(([label, available]) => (
        <li key={label} className="flex items-center gap-2 text-sm">
          {available ? (
            <CheckCircle2 className="size-3.5 text-success-600" />
          ) : (
            <XCircle className="size-3.5 text-gray-300" />
          )}
          <span className={available ? "text-gray-800" : "text-gray-400"}>{label}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * UAT evidence tooling.
 *
 * The certification checklist asks for encrypted and decrypted request bodies per
 * API, which the backend captures from real calls. This exposes the bundle and the
 * coverage gaps so it is clear what still needs to be exercised before submission.
 */
function UatTab() {
  const coverage = useApiQuery(() => api.admin.uatCoverage(), [])
  const [downloading, setDownloading] = React.useState(false)

  async function downloadBundle() {
    setDownloading(true)
    try {
      const bundle = await api.admin.uatBundle(3)
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `uat-evidence-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      toast.success("Evidence bundle downloaded")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "The bundle could not be generated")
    } finally {
      setDownloading(false)
    }
  }

  const sections = Object.entries(coverage.data ?? {})
  const captured = sections.filter(([, count]) => count > 0).length

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Evidence Bundle</CardTitle>
          <CardDescription>
            Each captured call includes the cURL request, the encrypted session key and payload, their decrypted
            equivalents, the key version, the IV and the response.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-gray-500">
            Evidence is captured from real provider calls. A section stays empty until that call has actually been
            made against the provider, so exercise the flows you need before submitting.
          </p>
          <div>
            <Button variant="brand" disabled={downloading} onClick={() => void downloadBundle()}>
              {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              Download Evidence Bundle
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Coverage</CardTitle>
            <CardDescription>
              {coverage.loading
                ? "Loading…"
                : `${captured} of ${sections.length} checklist sections have at least one captured call`}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={coverage.refetch} disabled={coverage.loading}>
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {coverage.error ? (
            <ErrorState description={coverage.error} onRetry={coverage.refetch} />
          ) : coverage.loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : sections.length === 0 ? (
            <p className="text-sm text-gray-500">No coverage information available.</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {sections.map(([section, count]) => (
                <div key={section} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-gray-800">{section}</span>
                  {count > 0 ? (
                    <Badge variant="success" className="text-[11px]">
                      {count} captured
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="text-[11px]">Not captured</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
