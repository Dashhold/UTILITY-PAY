import * as React from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { AlertCircle, BadgePercent, Loader2, Lock, Wallet } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { BharatConnectScreen, JourneyStepper } from "@/components/brand/bharat-connect-screen"
import { DetailRow } from "@/components/brand/detail-row"
import { calculateCcf, calculateCommission } from "@/lib/bharat-connect/service"
import { payBillLive, LivePaymentError } from "@/lib/bharat-connect/live"
import { useBharatConnectFlow } from "@/lib/bharat-connect/flow-context"
import type { PaymentMode } from "@/lib/bharat-connect/types"
import { formatCurrency, formatDate } from "@/lib/utils"

/** Retailer wallet balance. Replaced by the wallet API once the backend is wired. */
const WALLET_BALANCE = 48250.75

const PAYMENT_MODES: { value: PaymentMode; label: string; description: string }[] = [
  { value: "Wallet", label: "Retailer Wallet", description: "Debited instantly from your main wallet" },
  { value: "Cash", label: "Cash", description: "Collected from the customer at the outlet" },
  { value: "UPI", label: "UPI", description: "Customer pays by UPI at the outlet" },
]

/**
 * Payment screen.
 *
 * Shows the bill details, Customer Convenience Fee, retailer commission and the
 * total payable amount, then takes an explicit confirmation before debiting.
 */
export function BharatConnectPayment() {
  const navigate = useNavigate()
  const flow = useBharatConnectFlow()
  const { biller, bill } = flow

  const [amountInput, setAmountInput] = React.useState(
    flow.amount != null ? String(flow.amount) : bill ? String(bill.billAmount) : ""
  )
  const [amountError, setAmountError] = React.useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [processing, setProcessing] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)

  if (!biller) return <Navigate to="/retailer/bharat-connect/categories" replace />

  const amount = Number(amountInput)
  const validAmount = amountInput !== "" && !Number.isNaN(amount) && amount > 0
  const ccf = validAmount ? calculateCcf(biller, amount) : 0
  const commission = validAmount ? calculateCommission(biller.categorySlug, amount) : 0
  const total = validAmount ? Math.round((amount + ccf) * 100) / 100 : 0

  const amountEditable =
    !bill || biller.supportsPartPay || biller.amountExactness !== "Exact"
  const insufficient = flow.paymentMode === "Wallet" && total > WALLET_BALANCE

  function validateAmount(): boolean {
    if (!validAmount) {
      setAmountError("Enter a valid amount greater than zero")
      return false
    }
    if (bill) {
      const due = bill.billAmount
      switch (biller!.amountExactness) {
        case "Exact":
          if (Math.abs(amount - due) > 0.001) {
            setAmountError(`This biller accepts the exact bill amount only (${formatCurrency(due)})`)
            return false
          }
          break
        case "Exact and above":
          if (amount < due) {
            setAmountError(`This biller accepts ${formatCurrency(due)} or more`)
            return false
          }
          break
        case "Exact and below":
          if (amount > due) {
            setAmountError(`This biller accepts ${formatCurrency(due)} or less`)
            return false
          }
          break
        default:
          break
      }
    }
    setAmountError(null)
    return true
  }

  function onPayClick() {
    if (!validateAmount()) return
    if (insufficient) {
      toast.error("Insufficient wallet balance. Raise a fund request or choose another payment mode.")
      return
    }
    setConfirmOpen(true)
  }

  async function onConfirmPay() {
    setConfirmOpen(false)
    setProcessing(true)
    setFailure(null)
    flow.setAmount(amount)

    try {
      const txn = await payBillLive({
        // Quoting the fetch reference makes the backend validate the amount
        // against what the biller returned, rather than trusting this form.
        requestRef: flow.fetchRef ?? undefined,
        billerId: biller!.id,
        billerName: biller!.name,
        categorySlug: biller!.categorySlug,
        connection: bill?.billNumber ?? Object.values(flow.params)[0] ?? "",
        amount,
        customerMobile: flow.customerMobile,
        customerName: flow.customerName || bill?.customerName || "Customer",
        paymentMode: flow.paymentMode,
        // Reused across retries of this attempt, so a resubmit cannot pay twice.
        idempotencyKey: flow.ensurePartnerTxnId(),
      })

      // A pending payment still routes to the success screen, which renders the
      // pending state and polls. Sending the retailer back to the form would
      // invite a second payment for a transaction that may already have gone
      // through.
      navigate(`/retailer/bharat-connect/success/${txn.id}`, { replace: true })
    } catch (err) {
      const e = err as LivePaymentError
      setFailure(e.message || "The payment could not be completed. Please retry.")
      setProcessing(false)
    }
  }

  if (processing) return <ProcessingScreen billerName={biller.name} total={total} />

  return (
    <BharatConnectScreen
      title="Confirm payment"
      description={`${biller.name} · ${biller.coverage}`}
      backTo={`/retailer/bharat-connect/billers/${biller.categorySlug}/${biller.id}`}
      backLabel="Back to bill details"
      meta={<JourneyStepper current="payment" />}
    >
      <div className="grid gap-4 lg:grid-cols-5">
        {/* ------------------------------------------------------ bill summary */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Bill details</CardTitle>
            <CardDescription>Verify the details with the customer before paying</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
              <DetailRow label="Biller" value={biller.name} emphasis />
              <DetailRow label="Biller ID" value={biller.id} mono />
              <DetailRow label="Category" value={flow.categorySlug ? titleize(flow.categorySlug) : "-"} />
              {Object.entries(flow.params).map(([key, value]) => {
                const param = biller.params.find((p) => p.key === key)
                if (!param || !value) return null
                return <DetailRow key={key} label={param.label} value={value} mono />
              })}
              <DetailRow label="Customer Mobile" value={flow.customerMobile || "-"} mono />
              {bill && (
                <>
                  <Separator className="my-2" />
                  <DetailRow label="Customer Name" value={bill.customerName} emphasis />
                  <DetailRow label="Bill Number" value={bill.billNumber} mono />
                  <DetailRow label="Bill Date" value={formatDate(bill.billDate)} />
                  <DetailRow label="Due Date" value={formatDate(bill.billDueDate)} />
                  <DetailRow label="Bill Amount" value={formatCurrency(bill.billAmount)} mono emphasis />
                </>
              )}
              {!bill && (
                <>
                  <Separator className="my-2" />
                  <div className="flex items-start gap-2 rounded-md bg-info-bg px-3 py-2">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-info-500" />
                    <p className="text-[11px] leading-snug text-gray-600">
                      Quick pay &mdash; this biller does not return a bill. Confirm the amount
                      with the customer before proceeding.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bc-amount">Amount to pay</Label>
              <Input
                id="bc-amount"
                inputMode="decimal"
                value={amountInput}
                readOnly={!amountEditable}
                onChange={(e) => {
                  setAmountInput(e.target.value.replace(/[^\d.]/g, ""))
                  setAmountError(null)
                }}
                className={amountEditable ? "table-num" : "table-num bg-gray-50"}
                aria-invalid={!!amountError}
              />
              {!amountEditable && (
                <span className="text-[11px] text-gray-500">
                  This biller accepts the exact bill amount only.
                </span>
              )}
              {amountEditable && bill && (
                <span className="text-[11px] text-gray-500">
                  Biller accepts: {biller.amountExactness.toLowerCase()} of {formatCurrency(bill.billAmount)}.
                </span>
              )}
              {amountError && <span className="text-xs text-danger-500">{amountError}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Payment mode</Label>
              <RadioGroup
                value={flow.paymentMode}
                onValueChange={(v) => flow.setPaymentMode(v as PaymentMode)}
                className="grid gap-2 sm:grid-cols-3"
              >
                {PAYMENT_MODES.map((mode) => (
                  <label
                    key={mode.value}
                    className={
                      flow.paymentMode === mode.value
                        ? "flex cursor-pointer items-start gap-2 rounded-md border border-gray-900 bg-gray-50 px-3 py-2.5"
                        : "flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 px-3 py-2.5 hover:border-gray-400"
                    }
                  >
                    <RadioGroupItem value={mode.value} className="mt-0.5" />
                    <span>
                      <span className="block text-[13px] font-medium text-gray-900">{mode.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
                        {mode.description}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        {/* --------------------------------------------------- amount summary */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Payment summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <DetailRow label="Bill amount" value={validAmount ? formatCurrency(amount) : "—"} mono />
                <DetailRow
                  label="Customer Convenience Fee (CCF)"
                  value={ccf > 0 ? formatCurrency(ccf) : "Nil"}
                  mono
                />
                <Separator className="my-2" />
                <div className="flex items-center justify-between gap-4 py-1">
                  <span className="text-sm font-semibold text-gray-900">Total payable</span>
                  <span className="table-num text-lg font-semibold text-gray-900">
                    {validAmount ? formatCurrency(total) : "—"}
                  </span>
                </div>
              </div>

              <div className="rounded-md border border-success-500/20 bg-success-bg px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-success-600">
                    <BadgePercent className="size-3.5" /> Your commission
                  </span>
                  <span className="table-num text-sm font-semibold text-success-600">
                    {commission > 0 ? formatCurrency(commission) : "—"}
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-snug text-success-600/80">
                  Credited to your commission wallet on settlement.
                </p>
              </div>

              {flow.paymentMode === "Wallet" && (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <DetailRow label="Wallet balance" value={formatCurrency(WALLET_BALANCE)} mono />
                  <DetailRow
                    label="Balance after payment"
                    value={validAmount ? formatCurrency(WALLET_BALANCE - total) : "—"}
                    mono
                    emphasis
                  />
                  {insufficient && (
                    <p className="mt-1 text-[11px] font-medium text-danger-500">
                      Insufficient balance for this payment.
                    </p>
                  )}
                </div>
              )}

              {failure && (
                <div className="flex items-start gap-2 rounded-md border border-danger-500/20 bg-danger-bg px-3 py-2.5">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-danger-600" />
                  <div>
                    <p className="text-xs font-semibold text-danger-600">Payment failed</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-gray-600">{failure}</p>
                  </div>
                </div>
              )}

              <Button
                variant="brand"
                className="h-10 w-full"
                onClick={onPayClick}
                disabled={!validAmount || insufficient}
              >
                <Lock className="size-3.5" />
                Pay {validAmount ? formatCurrency(total) : ""}
              </Button>

              <p className="flex items-start gap-1.5 text-[10px] leading-snug text-gray-400">
                <Wallet className="mt-0.5 size-3 shrink-0" />
                Payment is routed through Bharat Connect. A unique Bharat Connect
                transaction ID is issued on success and printed on the receipt.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Biller rules
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px]">
                  Bill fetch: {biller.fetchRequirement.toLowerCase().replace("_", " ")}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Amount: {biller.amountExactness}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Part pay: {biller.supportsPartPay ? "allowed" : "not allowed"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Pay ${formatCurrency(total)} to ${biller.name}?`}
        description={
          flow.paymentMode === "Wallet"
            ? `${formatCurrency(total)} will be debited from your wallet. This action cannot be reversed once the biller confirms the payment.`
            : `Collect ${formatCurrency(total)} from the customer by ${flow.paymentMode.toLowerCase()} before confirming. This action cannot be reversed once the biller confirms the payment.`
        }
        confirmLabel="Confirm & pay"
        onConfirm={onConfirmPay}
      />
    </BharatConnectScreen>
  )
}

function ProcessingScreen({ billerName, total }: { billerName: string; total: number }) {
  return (
    <BharatConnectScreen
      title="Processing payment"
      description="Do not close or refresh this page"
      meta={<JourneyStepper current="payment" />}
    >
      <div className="flex justify-center py-10">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <Loader2 className="size-9 animate-spin text-gray-400" />
            <div>
              <p className="text-base font-semibold text-gray-900">
                Paying {formatCurrency(total)} to {billerName}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Submitting the payment to Bharat Connect and waiting for the biller to confirm.
              </p>
            </div>
            <p className="max-w-xs text-[11px] leading-snug text-gray-400">
              If the connection drops, the transaction is protected by an idempotency key
              and will never be charged twice.
            </p>
          </CardContent>
        </Card>
      </div>
    </BharatConnectScreen>
  )
}

function titleize(slug: string) {
  return slug
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ")
}
