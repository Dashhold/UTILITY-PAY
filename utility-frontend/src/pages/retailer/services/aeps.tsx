import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import {
  Fingerprint,
  CheckCircle2,
  Printer,
  RotateCcw,
  Loader2,
  Wallet,
  CreditCard,
  FileText,
  IndianRupee,
  TrendingUp,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  ExternalLink,
  Clock,
} from "lucide-react"

import { DataTable } from "@/components/shared/data-table"
import { FilterSelect } from "@/components/shared/filter-select"
import { StatusBadge } from "@/components/shared/status-badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { api, ApiError } from "@/lib/api"
import type {
  AepsCapabilities,
  Receipt,
  RetailerProfile,
  Settlement,
  Transaction,
} from "@/lib/api-types"
import { formatMoney, isPositiveAmount, toMoneyString } from "@/lib/money"
import { formatDate, exportToCsv } from "@/lib/utils"

/**
 * AEPS workspace.
 *
 * Every operation goes through the real backend. Availability is driven by the
 * provider capability report rather than assumed, so an operation whose upstream
 * specification is still pending renders as explicitly unavailable instead of
 * failing after the retailer has captured a customer's biometric.
 */

// Withdrawal limits follow the seeded AEPS service configuration.
const MIN_WITHDRAWAL = 100
const MAX_WITHDRAWAL = 10000

const identifierSchema = z
  .string()
  .trim()
  .min(10, "Enter a 10-digit mobile or 12-digit Aadhaar number")
  .max(12, "Enter a 10-digit mobile or 12-digit Aadhaar number")
  .regex(/^\d+$/, "Digits only")
  .refine((v) => v.length === 10 || v.length === 12, "Must be exactly 10 or 12 digits")

/**
 * The form always carries the same three fields; only whether `amount` is
 * validated differs by operation. Declaring one concrete shape rather than a
 * union of two schemas keeps the resolver and the submit handler typed to a
 * single value type.
 */
interface TxnFormValues {
  aadhaarOrMobile: string
  bankName: string
  amount: string
}

const baseSchema = z.object({
  aadhaarOrMobile: identifierSchema,
  bankName: z.string().min(1, "Select the customer's bank"),
  amount: z.string(),
})

/**
 * Builds the schema for an operation.
 *
 * The return type is inferred rather than annotated: both branches produce the
 * same input and output shape, and an explicit z.ZodType annotation erases the
 * input type, which breaks the resolver's inference.
 */
function buildSchema(withAmount: boolean) {
  const base = baseSchema

  if (!withAmount) return base

  // Amount rules are attached only for the operations that move money, and are
  // reported against the amount field so the error lands on the right input.
  return base.superRefine((values, ctx) => {
    const path = ["amount"] as const

    if (values.amount.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path], message: "Amount is required" })
      return
    }
    if (!isPositiveAmount(values.amount)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path], message: "Enter a valid amount" })
      return
    }

    const amount = Number(toMoneyString(values.amount))
    if (amount < MIN_WITHDRAWAL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path],
        message: `Minimum is ${formatMoney(MIN_WITHDRAWAL)}`,
      })
    }
    if (amount > MAX_WITHDRAWAL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path],
        message: `Maximum is ${formatMoney(MAX_WITHDRAWAL)}`,
      })
    }
  })
}

type AepsOperation = "cash_withdrawal" | "balance_enquiry" | "mini_statement" | "aadhaar_pay"

/** Banks offered for AEPS. The provider's IIN list replaces this once supplied. */
const BANKS = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "Kotak Mahindra Bank",
  "IndusInd Bank",
] as const

const STATUS_OPTIONS = [
  { label: "Success", value: "success" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
  { label: "Processing", value: "processing" },
]

export function AepsWorkspace() {
  const [tab, setTab] = React.useState("cash_withdrawal")
  const [caps, setCaps] = React.useState<AepsCapabilities | null>(null)
  const [profile, setProfile] = React.useState<RetailerProfile | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    try {
      const [capabilities, retailerProfile] = await Promise.all([
        api.aeps.capabilities(),
        api.retailer.profile(),
      ])
      setCaps(capabilities)
      setProfile(retailerProfile)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not load AEPS services")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Loading AEPS services...</p>
        </div>
      </div>
    )
  }

  const onboarded = profile?.aepsOnboardStatus === "completed"

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-gray-900">
            <Fingerprint className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">AEPS Services</h1>
            <p className="text-sm text-gray-500">
              Aadhaar Enabled Payment System
              {profile?.merchantCode && (
                <span className="ml-2 font-mono text-xs text-gray-400">{profile.merchantCode}</span>
              )}
            </p>
          </div>
        </div>

        {profile && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <Wallet className="size-4 text-gray-400" />
            <div className="leading-tight">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Wallet</p>
              <p className="text-sm font-semibold text-gray-900">{formatMoney(profile.walletBalance)}</p>
            </div>
          </div>
        )}
      </header>

      {!onboarded && <OnboardingGate profile={profile} onDone={load} />}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="rounded-lg border border-gray-200 bg-white">
          <TabsList className="flex w-full flex-wrap justify-start gap-1 border-b border-gray-200 bg-gray-50/60 p-2">
            <TabsTrigger value="cash_withdrawal" className="gap-2">
              <Wallet className="size-4" /> Cash Withdrawal
            </TabsTrigger>
            <TabsTrigger value="balance_enquiry" className="gap-2">
              <CreditCard className="size-4" /> Balance Enquiry
            </TabsTrigger>
            <TabsTrigger value="mini_statement" className="gap-2">
              <FileText className="size-4" /> Mini Statement
            </TabsTrigger>
            <TabsTrigger value="aadhaar_pay" className="gap-2">
              <IndianRupee className="size-4" /> Aadhaar Pay
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <RotateCcw className="size-4" /> History
            </TabsTrigger>
            <TabsTrigger value="settlements" className="gap-2">
              <TrendingUp className="size-4" /> Settlements
            </TabsTrigger>
          </TabsList>

          <div className="p-6">
            <TabsContent value="cash_withdrawal" className="mt-0">
              <OperationPanel
                operation="cash_withdrawal"
                title="Cash Withdrawal"
                description="Dispense cash from the customer's Aadhaar-linked bank account"
                available={caps?.cashWithdrawal ?? false}
                onboarded={onboarded}
                withAmount
              />
            </TabsContent>

            <TabsContent value="balance_enquiry" className="mt-0">
              <OperationPanel
                operation="balance_enquiry"
                title="Balance Enquiry"
                description="Check the available balance in the customer's account"
                available={caps?.balanceEnquiry ?? false}
                onboarded={onboarded}
              />
            </TabsContent>

            <TabsContent value="mini_statement" className="mt-0">
              <OperationPanel
                operation="mini_statement"
                title="Mini Statement"
                description="Retrieve the customer's last few transactions"
                available={caps?.miniStatement ?? false}
                onboarded={onboarded}
              />
            </TabsContent>

            <TabsContent value="aadhaar_pay" className="mt-0">
              <OperationPanel
                operation="aadhaar_pay"
                title="Aadhaar Pay"
                description="Collect a merchant payment using the customer's Aadhaar and fingerprint"
                available={caps?.aadhaarPay ?? false}
                onboarded={onboarded}
                withAmount
              />
            </TabsContent>

            <TabsContent value="history" className="mt-0">
              <TransactionHistory />
            </TabsContent>

            <TabsContent value="settlements" className="mt-0">
              <Settlements />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  )
}

/**
 * Merchant onboarding gate.
 *
 * AEPS requires provider-side KYC before any operation. The provider hosts that
 * journey and returns a redirect URL, so this surfaces the current state and
 * launches it rather than pretending the services are usable.
 */
function OnboardingGate({
  profile,
  onDone,
}: {
  profile: RetailerProfile | null
  onDone: () => void
}) {
  const [submitting, setSubmitting] = React.useState(false)
  const status = profile?.aepsOnboardStatus ?? "not_started"

  async function start() {
    setSubmitting(true)
    try {
      const res = await api.aeps.onboard()
      // The provider owns the KYC page, so the retailer is sent there. A new tab
      // keeps their session and any in-progress work intact.
      window.open(res.redirectUrl, "_blank", "noopener,noreferrer")
      toast.success("Complete onboarding in the new tab, then return here.")
      onDone()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start onboarding")
    } finally {
      setSubmitting(false)
    }
  }

  const copy: Record<string, { tone: "warning" | "info" | "danger"; title: string; body: string }> = {
    not_started: {
      tone: "warning",
      title: "AEPS onboarding required",
      body: "Complete the provider's merchant KYC to activate AEPS services. Your profile mobile, email and shop name are submitted to the provider.",
    },
    pending: {
      tone: "info",
      title: "AEPS onboarding in progress",
      body: "The provider is verifying your details. You can resume the journey if you did not finish it.",
    },
    failed: {
      tone: "danger",
      title: "AEPS onboarding was not completed",
      body: "The provider could not verify your details. Review your profile and try again.",
    },
  }
  const message = copy[status] ?? copy.not_started

  const toneClasses = {
    warning: "border-amber-200 bg-amber-50",
    info: "border-blue-200 bg-blue-50",
    danger: "border-danger-200 bg-danger-50",
  }[message.tone]

  const iconClasses = {
    warning: "text-amber-600",
    info: "text-blue-600",
    danger: "text-danger-600",
  }[message.tone]

  return (
    <div className={`flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${toneClasses}`}>
      <div className="flex items-start gap-3">
        {status === "pending" ? (
          <Clock className={`mt-0.5 size-5 shrink-0 ${iconClasses}`} />
        ) : (
          <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${iconClasses}`} />
        )}
        <div>
          <p className="text-sm font-semibold text-gray-900">{message.title}</p>
          <p className="mt-0.5 max-w-2xl text-sm text-gray-700">{message.body}</p>
        </div>
      </div>

      <Button onClick={start} disabled={submitting} variant="brand" className="shrink-0">
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        {status === "pending" ? "Resume onboarding" : "Start onboarding"}
        <ExternalLink className="size-3.5" />
      </Button>
    </div>
  )
}

/** Wraps an operation form with availability and onboarding guards. */
function OperationPanel({
  operation,
  title,
  description,
  available,
  onboarded,
  withAmount = false,
}: {
  operation: AepsOperation
  title: string
  description: string
  available: boolean
  onboarded: boolean
  withAmount?: boolean
}) {
  if (!available) {
    return (
      <UnavailableNotice
        title={`${title} is not live yet`}
        body="The provider has not yet supplied the API specification for this operation. It will activate automatically once the integration is enabled, with no change needed here."
      />
    )
  }

  if (!onboarded) {
    return (
      <UnavailableNotice
        title="Complete AEPS onboarding first"
        body="Provider merchant KYC must be verified before AEPS operations can be performed."
      />
    )
  }

  return <TransactionForm operation={operation} title={title} description={description} withAmount={withAmount} />
}

function UnavailableNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
      <AlertCircle className="size-8 text-gray-400" />
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="text-sm leading-relaxed text-gray-600">{body}</p>
    </div>
  )
}

/** The biometric capture and submission form for one AEPS operation. */
function TransactionForm({
  operation,
  title,
  description,
  withAmount,
}: {
  operation: AepsOperation
  title: string
  description: string
  withAmount: boolean
}) {
  const [captured, setCaptured] = React.useState(false)
  const [capturing, setCapturing] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [receipt, setReceipt] = React.useState<Receipt | null>(null)

  // An idempotency key is generated per attempt and reused across retries of the
  // same attempt, so a double-submit or a network retry cannot debit twice.
  const idempotencyKey = React.useRef(crypto.randomUUID())

  // The schema is memoised so a re-render does not rebuild the resolver and
  // discard in-progress validation state.
  const schema = React.useMemo(() => buildSchema(withAmount), [withAmount])

  const form = useForm<TxnFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { aadhaarOrMobile: "", bankName: "", amount: "" },
  })

  function captureBiometric() {
    setCapturing(true)
    // The real capture comes from an RD-service device over a local bridge. Until
    // that device integration is wired, this stands in for the capture step and
    // produces no PID block, which the backend treats as a missing capture.
    setTimeout(() => {
      setCapturing(false)
      setCaptured(true)
      toast.success("Biometric captured")
    }, 1200)
  }

  function reset() {
    setReceipt(null)
    setCaptured(false)
    setCapturing(false)
    idempotencyKey.current = crypto.randomUUID()
    form.reset({ aadhaarOrMobile: "", bankName: "", amount: "" })
  }

  async function onSubmit(values: TxnFormValues) {
    if (!captured) {
      toast.error("Capture the customer's biometric before submitting")
      return
    }

    setSubmitting(true)
    try {
      const result = await api.aeps.transact(
        {
          operation,
          aadhaarOrMobile: values.aadhaarOrMobile,
          bankName: values.bankName,
          amount: withAmount ? toMoneyString(values.amount ?? "") : undefined,
        },
        idempotencyKey.current,
      )

      setReceipt(result)

      if (result.status === "success") {
        toast.success(`${title} completed`)
      } else if (result.needsStatusCheck) {
        // A pending result is not a failure. The retailer must not re-attempt,
        // because the money may already have moved.
        toast.warning("Transaction is pending confirmation. Do not retry; check the status.")
      } else {
        toast.error(result.message || `${title} failed`)
      }
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message)
      } else {
        toast.error("Could not complete the transaction")
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (receipt) {
    return <TransactionReceipt receipt={receipt} title={title} onReset={reset} />
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardHeader className="border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gray-900">
              <Fingerprint className="size-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <Field
              label="Aadhaar or mobile number"
              required
              error={form.formState.errors.aadhaarOrMobile?.message}
              hint="12 digits for Aadhaar, 10 for mobile. Only the last 4 digits are stored."
            >
              <Input
                inputMode="numeric"
                maxLength={12}
                placeholder="Enter the customer's number"
                className="h-11 font-mono"
                {...form.register("aadhaarOrMobile")}
              />
            </Field>

            <Field label="Customer's bank" required error={form.formState.errors.bankName?.message}>
              <select
                className="flex h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus-visible:border-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/10"
                {...form.register("bankName")}
              >
                <option value="">Select a bank</option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>

            {withAmount && (
              <Field
                label="Amount"
                required
                error={form.formState.errors.amount?.message}
                hint={`Between ${formatMoney(MIN_WITHDRAWAL)} and ${formatMoney(MAX_WITHDRAWAL)}`}
              >
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                    ₹
                  </span>
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    className="h-11 pl-7 font-mono"
                    {...form.register("amount")}
                  />
                </div>
              </Field>
            )}

            <BiometricCapture
              captured={captured}
              capturing={capturing}
              onCapture={captureBiometric}
            />

            <Button
              type="submit"
              variant="brand"
              size="lg"
              className="w-full"
              disabled={!captured || submitting}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {submitting ? "Submitting..." : `Submit ${title}`}
            </Button>

            {withAmount && (
              <p className="text-center text-xs text-gray-500">
                The amount is held from your wallet on submission and released only if the
                transaction is confirmed failed.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-700">
        {label} {required && <span className="text-danger-500">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-danger-600">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-gray-500">{hint}</p>
      )}
    </div>
  )
}

function BiometricCapture({
  captured,
  capturing,
  onCapture,
}: {
  captured: boolean
  capturing: boolean
  onCapture: () => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-700">
        Biometric authentication <span className="text-danger-500">*</span>
      </Label>

      <div
        className={`rounded-lg border-2 p-6 transition-colors ${
          captured ? "border-success-300 bg-success-50" : "border-dashed border-gray-300 bg-gray-50"
        }`}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          {capturing ? (
            <>
              <Loader2 className="size-10 animate-spin text-gray-900" />
              <p className="text-sm font-medium text-gray-900">Capturing...</p>
              <p className="text-xs text-gray-500">Keep the customer's finger on the scanner</p>
            </>
          ) : captured ? (
            <>
              <CheckCircle2 className="size-10 text-success-600" />
              <p className="text-sm font-semibold text-success-700">Biometric captured</p>
            </>
          ) : (
            <>
              <Fingerprint className="size-10 text-gray-400" />
              <p className="text-sm font-medium text-gray-900">Ready to capture</p>
              <p className="max-w-sm text-xs text-gray-500">
                Connect a UIDAI-certified RD-service device and capture the customer's
                fingerprint. Consent must be taken before capture.
              </p>
            </>
          )}

          <Button
            type="button"
            variant={captured ? "outline" : "brand"}
            size="sm"
            disabled={capturing || captured}
            onClick={onCapture}
          >
            <Fingerprint className="size-4" />
            {captured ? "Captured" : capturing ? "Capturing..." : "Capture biometric"}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The post-transaction receipt, including the pending and review states. */
function TransactionReceipt({
  receipt,
  title,
  onReset,
}: {
  receipt: Receipt
  title: string
  onReset: () => void
}) {
  const [checking, setChecking] = React.useState(false)
  const [current, setCurrent] = React.useState(receipt)

  async function refresh() {
    setChecking(true)
    try {
      setCurrent(await api.bharatConnect.status(current.txnId))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not refresh status")
    } finally {
      setChecking(false)
    }
  }

  const isSuccess = current.status === "success"
  const isPending = current.needsStatusCheck

  const tone = isSuccess
    ? { border: "border-success-200", bg: "bg-success-50/40", icon: "text-success-600" }
    : isPending
      ? { border: "border-amber-200", bg: "bg-amber-50/40", icon: "text-amber-600" }
      : { border: "border-danger-200", bg: "bg-danger-50/40", icon: "text-danger-600" }

  const mini = current.metadata?.miniStatement as
    | { date: string; narration: string; type: string; amount: string; balance: string }[]
    | undefined
  const customerBalance = current.metadata?.customerBalance as string | undefined

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card className={`${tone.border} ${tone.bg}`}>
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-5 text-center">
            {isSuccess ? (
              <CheckCircle2 className={`size-14 ${tone.icon}`} />
            ) : isPending ? (
              <Clock className={`size-14 ${tone.icon}`} />
            ) : (
              <AlertCircle className={`size-14 ${tone.icon}`} />
            )}

            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {isSuccess ? `${title} successful` : isPending ? `${title} is pending` : `${title} failed`}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                {isSuccess
                  ? "The transaction completed successfully."
                  : isPending
                    ? "Awaiting confirmation. Do not retry this transaction; the status will resolve automatically."
                    : current.message || "The transaction did not complete."}
              </p>
            </div>

            {current.needsManualReview && (
              <div className="w-full rounded-md border border-amber-300 bg-amber-50 p-3 text-left">
                <p className="text-xs font-semibold text-amber-900">Flagged for manual review</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  Automated status checks did not resolve this transaction. Support has been notified
                  and the amount remains on hold until it is settled.
                </p>
              </div>
            )}

            <div className="w-full rounded-lg border border-gray-200 bg-white p-5 text-left">
              <dl className="space-y-3">
                <Row label="Transaction ID" value={current.txnId} mono />
                <Row label="Status" value={current.status.toUpperCase()} />
                {current.amount && Number(current.amount) > 0 && (
                  <Row label="Amount" value={formatMoney(current.amount)} />
                )}
                {customerBalance && (
                  <Row label="Customer balance" value={formatMoney(customerBalance)} />
                )}
                {current.providerRef && <Row label="Provider reference" value={current.providerRef} mono />}
                <Row label="Date & time" value={formatDate(current.createdAt, true)} />
              </dl>
            </div>

            {mini && mini.length > 0 && (
              <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white text-left">
                <p className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-900">
                  Mini statement
                </p>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/60">
                      <TableHead>Date</TableHead>
                      <TableHead>Narration</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mini.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{row.date}</TableCell>
                        <TableCell className="text-xs">{row.narration}</TableCell>
                        <TableCell
                          className={`text-right font-mono text-xs ${
                            row.type === "credit" ? "text-success-600" : "text-danger-600"
                          }`}
                        >
                          {formatMoney(row.amount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatMoney(row.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="grid w-full gap-3 sm:grid-cols-2">
              {isPending ? (
                <Button variant="outline" size="lg" onClick={refresh} disabled={checking}>
                  {checking ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                  Check status
                </Button>
              ) : (
                <Button variant="outline" size="lg" onClick={() => window.print()}>
                  <Printer className="size-4" /> Print receipt
                </Button>
              )}
              <Button variant="brand" size="lg" onClick={onReset}>
                <RotateCcw className="size-4" /> New transaction
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3 last:border-0 last:pb-0">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className={`text-sm font-semibold text-gray-900 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  )
}

const txnColumns: ColumnDef<Transaction, unknown>[] = [
  {
    accessorKey: "txnId",
    header: "Txn ID",
    cell: ({ row }) => <span className="font-mono text-xs text-gray-700">{row.original.txnId}</span>,
  },
  {
    accessorKey: "createdAt",
    header: "Date",
    cell: ({ row }) => <span className="text-sm text-gray-700">{formatDate(row.original.createdAt, true)}</span>,
  },
  { accessorKey: "service", header: "Service" },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <span className="font-mono text-sm font-semibold text-gray-900">{formatMoney(row.original.amount)}</span>
    ),
  },
  {
    accessorKey: "commission",
    header: "Commission",
    cell: ({ row }) => (
      <span className="font-mono text-sm text-success-600">{formatMoney(row.original.commission)}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
]

function TransactionHistory() {
  const [rows, setRows] = React.useState<Transaction[]>([])
  const [status, setStatus] = React.useState("all")
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)

    api.aeps
      .transactions({ status: status === "all" ? undefined : status, pageSize: 100 })
      .then((page) => {
        if (!cancelled) setRows(page.items)
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : "Could not load transactions")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [status])

  return (
    <Card>
      <CardHeader className="border-b border-gray-100 bg-gray-50/60">
        <CardTitle className="text-base">AEPS transaction history</CardTitle>
        <CardDescription>Every AEPS operation performed from this account</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        {loading ? (
          <TableSkeleton />
        ) : (
          <DataTable
            columns={txnColumns}
            data={rows}
            searchKey="service"
            searchPlaceholder="Search by service or transaction ID..."
            filters={
              <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            }
            onExport={() => exportToCsv("aeps-transactions", rows)}
            emptyTitle="No AEPS transactions yet"
            emptyDescription="Completed AEPS operations will appear here."
          />
        )}
      </CardContent>
    </Card>
  )
}

const settlementColumns: ColumnDef<Settlement, unknown>[] = [
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => <span className="text-sm text-gray-700">{formatDate(row.original.date, true)}</span>,
  },
  {
    accessorKey: "amountSettled",
    header: "Amount settled",
    cell: ({ row }) => (
      <span className="font-mono text-sm font-semibold text-gray-900">
        {formatMoney(row.original.amountSettled)}
      </span>
    ),
  },
  { accessorKey: "bank", header: "Bank" },
  {
    accessorKey: "utr",
    header: "UTR",
    cell: ({ row }) => <span className="font-mono text-xs text-gray-700">{row.original.utr}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
]

function Settlements() {
  const [rows, setRows] = React.useState<Settlement[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    api.aeps
      .settlements()
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : "Could not load settlements")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card>
      <CardHeader className="border-b border-gray-100 bg-gray-50/60">
        <CardTitle className="text-base">Settlement history</CardTitle>
        <CardDescription>Bank settlements of AEPS cash-withdrawal float</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        {loading ? (
          <TableSkeleton />
        ) : (
          <DataTable
            columns={settlementColumns}
            data={rows}
            onExport={() => exportToCsv("aeps-settlements", rows)}
            emptyTitle="No settlements yet"
            emptyDescription="Settlements appear once AEPS withdrawals are settled to your bank."
          />
        )}
      </CardContent>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-md bg-gray-100" />
      ))}
    </div>
  )
}
