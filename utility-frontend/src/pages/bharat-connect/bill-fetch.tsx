import * as React from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { AlertCircle, ArrowRight, Loader2, RefreshCw, Zap } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { BharatConnectScreen, JourneyStepper } from "@/components/brand/bharat-connect-screen"
import { DetailRow } from "@/components/brand/detail-row"
import { findBiller } from "@/lib/bharat-connect/billers"
import { calculateCcf } from "@/lib/bharat-connect/service"
import { fetchBillLive, LiveFetchError } from "@/lib/bharat-connect/live"
import { useBharatConnectFlow } from "@/lib/bharat-connect/flow-context"
import type { BillerParam, FetchedBill } from "@/lib/bharat-connect/types"
import { formatCurrency, formatDate } from "@/lib/utils"

/**
 * Bill fetch screen — NPCI compliance screen 4.
 *
 * Mandate: Bharat Connect logo on the top right. Inputs are rendered
 * dynamically from the biller master, and the fetched bill shows the customer
 * name, bill amount, bill date, due date, bill number and status.
 */
export function BharatConnectBillFetch() {
  const { billerId = "" } = useParams()
  const navigate = useNavigate()
  const flow = useBharatConnectFlow()
  const biller = findBiller(billerId)

  const [values, setValues] = React.useState<Record<string, string>>(() =>
    flow.billerId === billerId ? flow.params : {}
  )
  const [mobile, setMobile] = React.useState(flow.customerMobile)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [fetching, setFetching] = React.useState(false)
  const [fetchError, setFetchError] = React.useState<{ message: string; code: string } | null>(null)
  const [bill, setBill] = React.useState<FetchedBill | null>(flow.billerId === billerId ? flow.bill : null)

  React.useEffect(() => {
    if (biller && flow.billerId !== billerId) flow.selectBiller(billerId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billerId])

  if (!biller) return <Navigate to="/retailer/bharat-connect/categories" replace />

  const quickPayOnly = biller.fetchRequirement === "NOT_SUPPORTED"

  function validate(): boolean {
    const next: Record<string, string> = {}
    for (const p of biller!.params) {
      const raw = (values[p.key] ?? "").trim()
      if (!raw) {
        if (!p.optional) next[p.key] = `${p.label} is required`
        continue
      }
      if (p.minLength && raw.length < p.minLength) next[p.key] = `${p.label} must be at least ${p.minLength} characters`
      else if (p.maxLength && raw.length > p.maxLength) next[p.key] = `${p.label} must be at most ${p.maxLength} characters`
      else if (p.pattern && !new RegExp(p.pattern).test(raw)) next[p.key] = `${p.label} is not in the expected format`
    }
    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      next.__mobile = "Enter a valid 10-digit customer mobile number"
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function persist() {
    const trimmed = Object.fromEntries(
      biller!.params.map((p) => [p.key, (values[p.key] ?? "").trim()])
    )
    flow.setParams(trimmed)
    flow.setCustomerMobile(mobile.trim())
    return trimmed
  }

  async function onFetch() {
    if (!validate()) return
    const params = persist()
    setFetching(true)
    setFetchError(null)
    setBill(null)
    try {
      // Live fetch. The returned requestRef is retained on the flow so payment
      // can quote it, which is what makes the backend enforce the biller's
      // amount rather than trusting the payment form.
      const fetched = await fetchBillLive(biller!.id, params)
      setBill(fetched)
      flow.setBill(fetched)
      flow.setFetchRef(fetched.requestRef)
      toast.success("Bill fetched successfully")
    } catch (err) {
      const e = err as LiveFetchError
      setFetchError({ message: e.message, code: e.code ?? "BC-ERR" })
      flow.setBill(null)
      flow.setFetchRef(null)
    } finally {
      setFetching(false)
    }
  }

  function onQuickPay() {
    if (!validate()) return
    persist()
    flow.setBill(null)
    flow.setAmount(null)
    navigate("/retailer/bharat-connect/payment")
  }

  function onProceed() {
    persist()
    navigate("/retailer/bharat-connect/payment")
  }

  const ccfPreview = bill ? calculateCcf(biller, bill.billAmount) : 0

  return (
    <BharatConnectScreen
      title={biller.name}
      description={`${biller.coverage} · Biller ID ${biller.id}`}
      backTo={`/retailer/bharat-connect/billers/${biller.categorySlug}`}
      backLabel="Change biller"
      meta={<JourneyStepper current="fetch" />}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------------ input parameters */}
        <Card>
          <CardHeader>
            <CardTitle>{quickPayOnly ? "Enter account details" : "Fetch bill"}</CardTitle>
            <CardDescription>
              {quickPayOnly
                ? "This biller does not support bill fetch. Enter the details below and proceed to payment."
                : "Enter the details printed on the bill to retrieve the current outstanding amount."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {biller.params.map((p) => (
              <ParamField
                key={p.key}
                param={p}
                value={values[p.key] ?? ""}
                error={errors[p.key]}
                onChange={(v) => setValues((prev) => ({ ...prev, [p.key]: v }))}
              />
            ))}

            <Separator />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bc-customer-mobile">
                Customer Mobile Number <span className="text-danger-500">*</span>
              </Label>
              <Input
                id="bc-customer-mobile"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile number"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                aria-invalid={!!errors.__mobile}
              />
              <span className="text-[11px] text-gray-500">
                Used for the SMS receipt and to look up this transaction later.
              </span>
              {errors.__mobile && <span className="text-xs text-danger-500">{errors.__mobile}</span>}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {!quickPayOnly && (
                <Button variant="brand" className="flex-1" onClick={onFetch} disabled={fetching}>
                  {fetching ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  {fetching ? "Fetching bill..." : bill ? "Fetch again" : "Fetch bill"}
                </Button>
              )}
              {(quickPayOnly || biller.supportsAdhoc) && (
                <Button
                  variant={quickPayOnly ? "brand" : "outline"}
                  className="flex-1"
                  onClick={onQuickPay}
                  disabled={fetching}
                >
                  <Zap className="size-3.5" /> Quick pay
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* -------------------------------------------------- fetched bill */}
        <Card>
          <CardHeader>
            <CardTitle>Bill details</CardTitle>
            <CardDescription>
              Details returned by the biller through Bharat Connect
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fetching && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Loader2 className="size-6 animate-spin text-gray-400" />
                <p className="text-xs text-gray-500">Requesting bill from the biller...</p>
              </div>
            )}

            {!fetching && fetchError && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-danger-bg">
                  <AlertCircle className="size-5 text-danger-600" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Bill could not be fetched</p>
                  <p className="mt-1 text-xs text-gray-500">{fetchError.message}</p>
                  <p className="table-num mt-2 text-[11px] text-gray-400">
                    Response code: {fetchError.code}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={onFetch}>
                  <RefreshCw className="size-3.5" /> Retry
                </Button>
              </div>
            )}

            {!fetching && !fetchError && !bill && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <p className="text-sm font-medium text-gray-700">No bill fetched yet</p>
                <p className="max-w-xs text-xs text-gray-500">
                  {quickPayOnly
                    ? "This biller settles on quick pay. Enter the account details and continue."
                    : "Fill in the account details on the left and select Fetch bill."}
                </p>
              </div>
            )}

            {!fetching && bill && (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Customer
                    </span>
                    <Badge variant={bill.status === "DUE" ? "warning" : "success"} dot>
                      {bill.status === "DUE" ? "Payment due" : bill.status === "PAID" ? "Already paid" : "Not available"}
                    </Badge>
                  </div>
                  <p className="text-base font-semibold text-gray-900">{bill.customerName}</p>

                  <Separator className="my-3" />

                  <DetailRow label="Bill Number" value={bill.billNumber} mono />
                  <DetailRow label="Bill Date" value={formatDate(bill.billDate)} />
                  <DetailRow label="Due Date" value={formatDate(bill.billDueDate)} />
                  {bill.billPeriod && <DetailRow label="Bill Period" value={bill.billPeriod} />}
                  {bill.additionalInfo?.map((info) => (
                    <DetailRow key={info.name} label={info.name} value={info.value} />
                  ))}

                  <Separator className="my-3" />

                  <DetailRow label="Bill Amount" value={formatCurrency(bill.billAmount)} mono emphasis />
                  <DetailRow
                    label="Customer Convenience Fee (CCF)"
                    value={ccfPreview > 0 ? formatCurrency(ccfPreview) : "Nil"}
                    mono
                  />
                </div>

                <Button variant="brand" className="w-full" onClick={onProceed}>
                  Proceed to payment <ArrowRight className="size-3.5" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </BharatConnectScreen>
  )
}

function ParamField({
  param,
  value,
  error,
  onChange,
}: {
  param: BillerParam
  value: string
  error?: string
  onChange: (v: string) => void
}) {
  const id = `bc-param-${param.key}`
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {param.label} {!param.optional && <span className="text-danger-500">*</span>}
      </Label>
      <Input
        id={id}
        type={param.type === "date" ? "date" : "text"}
        inputMode={param.type === "number" || param.type === "tel" ? "numeric" : undefined}
        maxLength={param.maxLength}
        placeholder={param.placeholder}
        value={value}
        onChange={(e) =>
          onChange(
            param.type === "number" || param.type === "tel"
              ? e.target.value.replace(/\D/g, "")
              : e.target.value
          )
        }
        aria-invalid={!!error}
      />
      {param.helpText && !error && <span className="text-[11px] text-gray-500">{param.helpText}</span>}
      {error && <span className="text-xs text-danger-500">{error}</span>}
    </div>
  )
}
