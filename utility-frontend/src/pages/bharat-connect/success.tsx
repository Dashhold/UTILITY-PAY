import * as React from "react"
import { Link, Navigate, useNavigate, useParams } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import { Check, MessageSquare, Receipt, RotateCcw, Volume2, VolumeX } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { BharatConnectScreen, JourneyStepper } from "@/components/brand/bharat-connect-screen"
import { BAssuredMark } from "@/components/brand/b-assured"
import { DetailRow } from "@/components/brand/detail-row"
import { AGENT_PROFILE, buildSmsReceipt } from "@/lib/bharat-connect/service"
import { getTxnLive, refreshTxnStatus, syncTxns } from "@/lib/bharat-connect/live"
import type { BharatConnectTxn } from "@/lib/bharat-connect/types"
import { useBharatConnectFlow } from "@/lib/bharat-connect/flow-context"
import { useSonicBranding } from "@/lib/use-sonic-branding"
import { formatCurrency } from "@/lib/utils"

/**
 * Payment Successful screen — NPCI compliance screen 5.
 *
 * Mandate: the B-Assured logo must be displayed **and** the official Bharat
 * Connect sonic branding clip must play simultaneously with it.
 */
export function BharatConnectSuccess() {
  const { txnId = "" } = useParams()
  const navigate = useNavigate()
  const flow = useBharatConnectFlow()
  const reduceMotion = useReducedMotion()
  const { play, state: sonicState, isAvailable } = useSonicBranding()

  const [txn, setTxn] = React.useState<BharatConnectTxn | undefined>(() => getTxnLive(txnId))
  const [loading, setLoading] = React.useState(() => getTxnLive(txnId) === undefined)

  // A direct visit or a reload has no cached transaction, so the server is the
  // source of truth here.
  React.useEffect(() => {
    if (txn) return

    let cancelled = false
    void syncTxns().then(() => {
      if (cancelled) return
      setTxn(getTxnLive(txnId))
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [txn, txnId])

  const isPending = txn?.status === "pending"

  // A pending payment is polled so the retailer is never left deciding whether
  // to retry, which is precisely when a customer gets charged twice.
  React.useEffect(() => {
    if (!isPending) return

    const timer = setInterval(async () => {
      const next = await refreshTxnStatus(txnId)
      if (next) setTxn(next)
    }, 8000)

    return () => clearInterval(timer)
  }, [isPending, txnId])

  // The sonic branding clip starts in the same commit that first paints the
  // B-Assured mark, satisfying the "played simultaneously" requirement. It is
  // gated on a settled success: playing the trust tone over a pending or failed
  // payment would tell the customer the wrong thing.
  React.useEffect(() => {
    if (txn?.status !== "success") return
    void play()
  }, [txn?.status, play])

  if (loading) {
    return (
      <BharatConnectScreen title="Payment" description="Loading transaction...">
        <div className="flex min-h-[40vh] items-center justify-center">
          <RotateCcw className="size-6 animate-spin text-gray-400" />
        </div>
      </BharatConnectScreen>
    )
  }

  if (!txn) return <Navigate to="/retailer/bharat-connect" replace />

  const at = new Date(txn.transactedAt)
  const sms = buildSmsReceipt(txn)

  function startNewPayment() {
    flow.reset()
    navigate("/retailer/bharat-connect")
  }

  return (
    <BharatConnectScreen
      title="Payment successful"
      description={`${txn.billerName} · ${txn.categoryName}`}
      meta={<JourneyStepper current="receipt" />}
    >
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="flex flex-col items-center gap-5 py-8 text-center">
            {/* ------------------------------------------- success animation */}
            <motion.div
              initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 240, damping: 18 }}
              className="relative flex size-16 items-center justify-center rounded-full bg-success-bg"
            >
              {!reduceMotion && (
                <motion.span
                  className="absolute inset-0 rounded-full bg-success-500/20"
                  initial={{ scale: 1, opacity: 0.7 }}
                  animate={{ scale: 1.7, opacity: 0 }}
                  transition={{ duration: 1.1, repeat: 2, ease: "easeOut" }}
                />
              )}
              <motion.span
                initial={reduceMotion ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.15, duration: 0.35 }}
              >
                <Check className="size-9 text-success-600" strokeWidth={3} />
              </motion.span>
            </motion.div>

            <div>
              <p className="text-xl font-semibold tracking-tight text-gray-900">
                {formatCurrency(txn.totalAmount)} paid successfully
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {txn.billerName} &middot; {txn.customerName}
              </p>
            </div>

            {/* ------------------------- B-Assured mark + sonic branding ---- */}
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="flex flex-col items-center gap-2"
              data-compliance="b-assured"
            >
              <BAssuredMark size="lg" />
              <p className="text-[11px] font-medium text-gray-500">
                This payment is protected under Bharat Connect
              </p>
              {isAvailable ? (
                <button
                  type="button"
                  onClick={() => void play()}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-700"
                >
                  <Volume2 className="size-3" />
                  {sonicState === "playing" ? "Playing Bharat Connect tone" : "Replay Bharat Connect tone"}
                </button>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-300">
                  <VolumeX className="size-3" /> Sonic branding clip not installed
                </span>
              )}
            </motion.div>

            <Separator />

            {/* ------------------------------------------- reference details */}
            <div className="w-full text-left">
              <DetailRow label="Bharat Connect Txn ID" value={txn.bharatConnectTxnId} mono emphasis />
              <DetailRow label="Partner Txn ID" value={txn.partnerTxnId} mono />
              <DetailRow label="Biller Reference Number" value={txn.approvalRefNumber} mono />
              <Separator className="my-2" />
              <DetailRow label="Bill amount" value={formatCurrency(txn.billAmount)} mono />
              <DetailRow
                label="Customer Convenience Fee (CCF)"
                value={txn.ccf > 0 ? formatCurrency(txn.ccf) : "Nil"}
                mono
              />
              <DetailRow label="Total amount" value={formatCurrency(txn.totalAmount)} mono emphasis />
              <Separator className="my-2" />
              <DetailRow
                label="Date"
                value={at.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
              />
              <DetailRow
                label="Time"
                value={at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              />
              <DetailRow label="Payment mode" value={txn.paymentMode} />
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button variant="brand" className="flex-1" asChild>
                <Link to={`/retailer/bharat-connect/receipt/${txn.id}`}>
                  <Receipt className="size-3.5" /> View receipt
                </Link>
              </Button>
              <Button variant="outline" className="flex-1" onClick={startNewPayment}>
                <RotateCcw className="size-3.5" /> New payment
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------- SMS receipt */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardContent className="pt-5">
              <div className="mb-3 flex items-center gap-2">
                <MessageSquare className="size-3.5 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900">SMS receipt sent</h2>
              </div>
              <p className="mb-3 text-[11px] text-gray-500">
                Delivered to <span className="table-num font-medium text-gray-700">{txn.customerMobile}</span>
              </p>
              <div className="rounded-lg rounded-bl-none border border-gray-200 bg-gray-50 p-3">
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-gray-700">{sms}</p>
              </div>
              <Button variant="ghost" size="sm" className="mt-2 w-full" asChild>
                <Link to={`/retailer/bharat-connect/sms-receipt/${txn.id}`}>View SMS receipt details</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Outlet</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{AGENT_PROFILE.outletName}</p>
              <div className="mt-2">
                <DetailRow label="Agent ID" value={txn.agentId} mono />
                <DetailRow label="Retailer" value={txn.retailerName} />
                <DetailRow label="Commission earned" value={formatCurrency(txn.commission)} mono emphasis />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </BharatConnectScreen>
  )
}
