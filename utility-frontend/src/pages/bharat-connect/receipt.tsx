import * as React from "react"
import { Navigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Copy, Download, LifeBuoy, Printer, Share2 } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/shared/status-badge"
import { BharatConnectScreen } from "@/components/brand/bharat-connect-screen"
import { BharatConnectLogo } from "@/components/brand/bharat-connect-logo"
import { BAssuredMark } from "@/components/brand/b-assured"
import { DetailRow } from "@/components/brand/detail-row"
import { AGENT_PROFILE } from "@/lib/bharat-connect/service"
import { getTxnLive, syncTxns } from "@/lib/bharat-connect/live"
import type { BharatConnectTxn } from "@/lib/bharat-connect/types"
import { BHARAT_CONNECT } from "@/lib/brand"
import { formatCurrency } from "@/lib/utils"

/**
 * Payment Receipt — NPCI compliance screen 6.
 *
 * Mandate: carries the B-Assured logo, the Bharat Connect transaction ID and the
 * Customer Convenience Fee (CCF), and must be printable and shareable.
 */
export function BharatConnectReceipt() {
  const { txnId = "" } = useParams()
  // A receipt is often opened directly from a link or reloaded for printing, so
  // it cannot rely on the cache being warm.
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

  const at = new Date(txn.transactedAt)
  const dateStr = at.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
  const timeStr = at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })

  function onPrint() {
    window.print()
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(txn!.bharatConnectTxnId)
      toast.success("Bharat Connect Txn ID copied")
    } catch {
      toast.error("Could not copy to clipboard")
    }
  }

  async function onShare() {
    const text = [
      `Bharat Connect payment receipt`,
      `Biller: ${txn!.billerName}`,
      `Customer: ${txn!.customerName}`,
      `Amount: ${formatCurrency(txn!.billAmount)}`,
      `CCF: ${txn!.ccf > 0 ? formatCurrency(txn!.ccf) : "Nil"}`,
      `Total: ${formatCurrency(txn!.totalAmount)}`,
      `Bharat Connect Txn ID: ${txn!.bharatConnectTxnId}`,
      `Partner Txn ID: ${txn!.partnerTxnId}`,
      `Status: ${txn!.status.toUpperCase()}`,
      `${dateStr} ${timeStr}`,
      `Paid at ${AGENT_PROFILE.outletName}`,
    ].join("\n")

    if (navigator.share) {
      try {
        await navigator.share({ title: "Bharat Connect payment receipt", text })
        return
      } catch {
        /* user dismissed the share sheet */
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Receipt copied to clipboard")
    } catch {
      toast.error("Sharing is not supported on this device")
    }
  }

  return (
    <BharatConnectScreen
      title="Payment receipt"
      description={`Bharat Connect Txn ID ${txn.bharatConnectTxnId}`}
      backTo="/retailer/bharat-connect/transactions"
      backLabel="Transaction history"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={onPrint}>
            <Printer className="size-3.5" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={onPrint}>
            <Download className="size-3.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={onShare}>
            <Share2 className="size-3.5" /> Share
          </Button>
        </>
      }
    >
      <div className="flex justify-center">
        {/* `print-surface` is isolated for printing — see index.css */}
        <div
          id="bharat-connect-receipt"
          className="print-surface w-full max-w-xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
        >
          {/* ------------------------------------------------ receipt header */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Merchant
              </p>
              <p className="mt-0.5 truncate text-base font-semibold text-gray-900">
                {AGENT_PROFILE.outletName}
              </p>
              <p className="table-num mt-0.5 text-[11px] text-gray-500">
                Agent ID {AGENT_PROFILE.agentId}
              </p>
            </div>
            {/* NPCI mandate: Bharat Connect logo on the top right. */}
            <BharatConnectLogo size="md" />
          </div>

          <Separator className="my-4" />

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Payment receipt</p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {dateStr} &middot; {timeStr}
              </p>
            </div>
            <StatusBadge status={txn.status} />
          </div>

          {/* -------------------------------------------------- amount block */}
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/70 p-4 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Total amount paid
            </p>
            <p className="table-num mt-1 text-2xl font-semibold text-gray-900">
              {formatCurrency(txn.totalAmount)}
            </p>
          </div>

          {/* ----------------------------------------------- customer/biller */}
          <div className="mt-4">
            <SectionTitle>Customer &amp; biller</SectionTitle>
            <DetailRow label="Customer Name" value={txn.customerName} emphasis />
            <DetailRow label="Customer Mobile" value={txn.customerMobile} mono />
            <DetailRow label="Biller" value={txn.billerName} emphasis />
            <DetailRow label="Biller ID" value={txn.billerId} mono />
            <DetailRow label="Category" value={txn.categoryName} />
            {Object.entries(txn.params).map(([key, value]) =>
              value ? <DetailRow key={key} label={humanize(key)} value={value} mono /> : null
            )}
            <DetailRow label="Bill Number" value={txn.billNumber} mono />
          </div>

          {/* ------------------------------------------------------- amounts */}
          <div className="mt-4">
            <SectionTitle>Amount breakdown</SectionTitle>
            <DetailRow label="Bill Amount" value={formatCurrency(txn.billAmount)} mono />
            <DetailRow
              label="Customer Convenience Fee (CCF)"
              value={txn.ccf > 0 ? formatCurrency(txn.ccf) : "Nil"}
              mono
            />
            <Separator className="my-2" />
            <DetailRow label="Total Amount" value={formatCurrency(txn.totalAmount)} mono emphasis />
            <DetailRow label="Retailer Commission" value={formatCurrency(txn.commission)} mono />
            <DetailRow label="Payment Mode" value={txn.paymentMode} />
          </div>

          {/* ---------------------------------------------------- references */}
          <div className="mt-4">
            <SectionTitle>Transaction references</SectionTitle>
            <DetailRow label="Bharat Connect Txn ID" value={txn.bharatConnectTxnId} mono emphasis />
            <DetailRow label="Partner Txn ID" value={txn.partnerTxnId} mono />
            <DetailRow label="Biller Reference Number" value={txn.approvalRefNumber} mono />
            <DetailRow label="Date" value={dateStr} />
            <DetailRow label="Time" value={timeStr} />
            <DetailRow label="Status" value={txn.status.toUpperCase()} emphasis />
          </div>

          <Separator className="my-4" />

          {/* -------------------------------------- B-Assured + attribution */}
          <div className="flex flex-col items-center gap-2 text-center">
            <BAssuredMark size="md" />
            <p className="max-w-sm text-[10px] leading-snug text-gray-500">
              This payment is B Assured. Processed through {BHARAT_CONNECT.name}, operated by{" "}
              {BHARAT_CONNECT.legalName}. Retain this receipt for your records.
            </p>
          </div>

          <div className="no-print mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-gray-100 pt-4">
            <Button variant="ghost" size="sm" onClick={onCopy}>
              <Copy className="size-3.5" /> Copy Txn ID
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/retailer/bharat-connect/complaints?txnRef=${txn.bharatConnectTxnId}`}>
                <LifeBuoy className="size-3.5" /> Raise a complaint
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </BharatConnectScreen>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{children}</p>
  )
}

function humanize(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}
