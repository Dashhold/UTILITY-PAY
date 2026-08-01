import * as React from "react"
import { Navigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Copy, MessageSquare, Send, CheckCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { BharatConnectScreen } from "@/components/brand/bharat-connect-screen"
import { DetailRow } from "@/components/brand/detail-row"
import { AGENT_PROFILE, buildSmsReceipt, smsSegments } from "@/lib/bharat-connect/service"
import { getTxnLive, syncTxns } from "@/lib/bharat-connect/live"
import type { BharatConnectTxn } from "@/lib/bharat-connect/types"
import { formatCurrency, formatDate } from "@/lib/utils"

/**
 * SMS Receipt — NPCI compliance screen 9.
 *
 * Mandate: an SMS receipt is generated after every successful payment and must
 * carry the merchant, amount, status, Bharat Connect transaction ID, partner
 * transaction ID and the date.
 */
export function BharatConnectSmsReceipt() {
  const { txnId = "" } = useParams()
  const [txn, setTxn] = React.useState<BharatConnectTxn | undefined>(() => getTxnLive(txnId))

  React.useEffect(() => {
    if (txn) return

    let cancelled = false
    void syncTxns().then(() => {
      if (!cancelled) setTxn(getTxnLive(txnId))
    })

    return () => {
      cancelled = true
    }
  }, [txn, txnId])

  if (!txn) return <Navigate to="/retailer/bharat-connect/transactions" replace />

  const message = buildSmsReceipt(txn)
  const segments = smsSegments(message)
  const sentAt = new Date(new Date(txn.transactedAt).getTime() + 4000)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(message)
      toast.success("SMS text copied")
    } catch {
      toast.error("Could not copy to clipboard")
    }
  }

  return (
    <BharatConnectScreen
      title="SMS receipt"
      description={`Sent to the customer for Bharat Connect Txn ID ${txn.bharatConnectTxnId}`}
      backTo={`/retailer/bharat-connect/receipt/${txn.id}`}
      backLabel="Payment receipt"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={onCopy}>
            <Copy className="size-3.5" /> Copy text
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success(`SMS receipt re-sent to ${txn.customerMobile}`)}
          >
            <Send className="size-3.5" /> Resend
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-5">
        {/* ------------------------------------------------- device preview */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Customer view</CardTitle>
            <CardDescription>As received on the customer's handset</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mx-auto w-full max-w-xs rounded-2xl border-4 border-gray-900 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between border-b border-gray-200 pb-2">
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="size-3.5 text-gray-400" />
                  <span className="text-[11px] font-semibold text-gray-700">UPAYBC</span>
                </span>
                <span className="text-[10px] text-gray-400">
                  {sentAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="rounded-lg rounded-bl-none bg-white p-3 shadow-sm">
                <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-800">
                  {message}
                </p>
              </div>
              <p className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-gray-400">
                <CheckCheck className="size-3" /> Delivered
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------- metadata */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Delivery details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailRow label="Recipient" value={txn.customerMobile} mono emphasis />
              <DetailRow label="Sender ID" value="UPAYBC" mono />
              <DetailRow label="Route" value="Transactional (DLT registered)" />
              <DetailRow label="Sent at" value={formatDate(sentAt.toISOString(), true)} />
              <DetailRow label="Delivery status" value={<Badge variant="success" dot>Delivered</Badge>} />
              <Separator className="my-2" />
              <DetailRow label="Characters" value={`${message.length}`} mono />
              <DetailRow label="Segments" value={`${segments} × 160`} mono />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mandatory content check</CardTitle>
              <CardDescription>
                Every field NPCI requires in a Bharat Connect SMS receipt
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DetailRow label="Merchant" value={AGENT_PROFILE.outletName} />
              <DetailRow label="Biller" value={txn.billerName} />
              <DetailRow label="Amount" value={formatCurrency(txn.totalAmount)} mono emphasis />
              <DetailRow label="Status" value={txn.status.toUpperCase()} />
              <DetailRow label="Bharat Connect Txn ID" value={txn.bharatConnectTxnId} mono emphasis />
              <DetailRow label="Partner Txn ID" value={txn.partnerTxnId} mono />
              <DetailRow label="Date" value={formatDate(txn.transactedAt, true)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </BharatConnectScreen>
  )
}
