import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { LogOut, Monitor, ShieldAlert, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ErrorState } from "@/components/shared/error-state"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useApiQuery, useMutation } from "@/hooks/use-api"
import { useAuth } from "@/context/auth-context"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/utils"

/**
 * Mirrors the backend password policy in internal/auth.
 *
 * Kept in step deliberately: a client rule that is looser produces a confusing
 * server rejection, and one that is stricter blocks passwords the server accepts.
 */
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
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "The new password must be different from the current one",
    path: ["newPassword"],
  })

type PasswordForm = z.infer<typeof passwordSchema>

function ChangePasswordTab() {
  const { logout } = useAuth()

  const form = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  })

  const change = useMutation(
    (values: PasswordForm) => api.auth.changePassword(values.currentPassword, values.newPassword),
    { successMessage: "Password changed" },
  )

  async function onSubmit(values: PasswordForm) {
    const result = await change.run(values)
    if (result === undefined) return

    form.reset()
    // The backend revokes every refresh token on a password change, including
    // this session's. Staying signed in would work until the access token
    // expired and then fail confusingly, so the sign-out is done now.
    toast.info("Please sign in again with your new password")
    await logout()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>
          Every session is signed out when the password changes, so anyone using the old one loses access. You
          will be asked to sign in again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex max-w-md flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              {...form.register("currentPassword")}
            />
            {form.formState.errors.currentPassword && (
              <p className="text-xs text-danger-500">{form.formState.errors.currentPassword.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              {...form.register("newPassword")}
            />
            <p className="text-xs text-gray-400">At least 8 characters, including a letter and a number.</p>
            {form.formState.errors.newPassword && (
              <p className="text-xs text-danger-500">{form.formState.errors.newPassword.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              {...form.register("confirmPassword")}
            />
            {form.formState.errors.confirmPassword && (
              <p className="text-xs text-danger-500">{form.formState.errors.confirmPassword.message}</p>
            )}
          </div>
          <div>
            <Button type="submit" variant="brand" disabled={change.pending}>
              Save Password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/**
 * Sign-in history.
 *
 * Failed attempts are shown alongside successful ones: a run of failures from an
 * unfamiliar address is the signal a retailer needs to change their password, and
 * hiding it would remove the only place they could notice.
 */
function LoginHistoryTab() {
  const query = useApiQuery(() => api.retailer.loginHistory(50), [])
  const entries = query.data ?? []

  if (query.error) {
    return <ErrorState description={query.error} onRetry={query.refetch} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in History</CardTitle>
        <CardDescription>The last 50 sign-in attempts on your account, successful or not</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {query.loading ? (
          <div className="flex flex-col gap-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">No sign-in activity recorded yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="flex items-start gap-3">
                  <div
                    className={
                      entry.success
                        ? "flex size-9 items-center justify-center rounded-md bg-success-bg text-success"
                        : "flex size-9 items-center justify-center rounded-md bg-danger-bg text-danger"
                    }
                  >
                    {entry.success ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {entry.device || "Unknown device"}
                      </p>
                      <Badge variant={entry.success ? "success" : "danger"} className="text-[10px]">
                        {entry.success ? "Success" : "Failed"}
                      </Badge>
                    </div>
                    <p className="table-num text-xs text-gray-500">{entry.ipAddress || "IP not recorded"}</p>
                    {!entry.success && entry.reason && (
                      <p className="text-xs text-danger-600">{entry.reason}</p>
                    )}
                  </div>
                </div>
                <p className="shrink-0 text-xs text-gray-400">{formatDate(entry.createdAt, true)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SessionsTab() {
  const { logout } = useAuth()
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const logoutAll = useMutation(() => api.auth.logoutAll(), {
    successMessage: "Signed out of all sessions",
  })

  async function confirmLogoutAll() {
    const result = await logoutAll.run()
    setConfirmOpen(false)
    if (result !== undefined) {
      // logout-all revokes every refresh token including this one, so staying on
      // the page would leave a session that dies at the next token refresh.
      toast.info("Signing you out on this device too")
      await logout()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Sessions</CardTitle>
        <CardDescription>
          Sign out everywhere if you have used a shared computer or think someone else has your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-md border border-gray-200 px-4 py-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-gray-100 text-gray-600">
            <Monitor className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">This device</p>
            <p className="text-xs text-gray-500">
              Individual sessions are not listed: the backend stores refresh tokens without device
              fingerprints, so it can revoke them all but cannot name them one by one.
            </p>
          </div>
        </div>

        <div>
          <Button variant="outline" onClick={() => setConfirmOpen(true)} disabled={logoutAll.pending}>
            <LogOut className="size-3.5" /> Sign out of all sessions
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Sign out of all sessions"
        description="Every device, including this one, will be signed out. You will need to log in again."
        confirmLabel="Sign out everywhere"
        destructive
        onConfirm={() => void confirmLogoutAll()}
      />
    </Card>
  )
}

export function RetailerSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Account Settings" description="Manage your password and account security" />

      <Tabs defaultValue="password">
        <TabsList>
          <TabsTrigger value="password">Change Password</TabsTrigger>
          <TabsTrigger value="history">Sign-in History</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="password">
          <ChangePasswordTab />
        </TabsContent>
        <TabsContent value="history">
          <LoginHistoryTab />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
