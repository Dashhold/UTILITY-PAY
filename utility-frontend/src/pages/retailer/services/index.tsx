import { Link } from "react-router-dom"
import { Fingerprint, Receipt, ArrowRight, AlertTriangle } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shared/error-state"
import { useApiQuery } from "@/hooks/use-api"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

interface ServiceTile {
  to: string
  title: string
  description: string
  icon: typeof Fingerprint
  /** True when the upstream reports the operations this tile needs. */
  available: boolean
  unavailableNote: string
}

export function ServicesPage() {
  const query = useApiQuery(() => api.retailer.serviceAvailability(), [])
  const capabilities = query.data

  // Availability comes from the provider clients rather than a local flag, so a
  // service the upstream cannot currently perform is not offered as if it could.
  const tiles: ServiceTile[] = [
    {
      to: "/retailer/services/aeps",
      title: "AEPS",
      description: "Cash withdrawal, balance enquiry, mini statement and Aadhaar Pay",
      icon: Fingerprint,
      available: Boolean(
        capabilities?.aeps.cashWithdrawal ||
        capabilities?.aeps.balanceEnquiry ||
        capabilities?.aeps.miniStatement ||
        capabilities?.aeps.aadhaarPay,
      ),
      unavailableNote:
        "The provider has not released the transactional AEPS endpoints for this account yet. Onboarding still works.",
    },
    {
      to: "/retailer/bharat-connect",
      title: "Bharat Connect",
      description: "Fetch and pay electricity, gas, water, broadband and other utility bills",
      icon: () => (
        <img 
          src="/b-mnemonic-reverse.png" 
          alt="Bharat Connect" 
          className="size-5"
        />
      ),
      available: Boolean(capabilities?.bharatConnect.viewBill && capabilities?.bharatConnect.payment),
      unavailableNote: "Bill payment is not enabled for this account yet.",
    },
  ]

  if (query.error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Services" description="Everything you can transact from your counter" />
        <ErrorState description={query.error} onRetry={query.refetch} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Services" description="Everything you can transact from your counter" />

      {query.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-2xl">
          {[0, 1].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="size-10 rounded-md" />
              <Skeleton className="mt-4 h-4 w-24" />
              <Skeleton className="mt-2 h-3 w-full" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-2xl">
          {tiles.map((tile) => {
            const body = (
              <Card
                className={cn(
                  "group flex h-full flex-col p-4 transition-colors",
                  tile.available
                    ? "cursor-pointer hover:border-brand-500 hover:bg-brand-50/30"
                    : "cursor-not-allowed opacity-70",
                )}
              >
                <div className="flex items-start justify-between">
                  <div
                    className={cn(
                      "flex size-10 items-center justify-center rounded-md",
                      tile.available ? "bg-brand-50 text-brand-600" : "bg-gray-100 text-gray-400",
                    )}
                  >
                    <tile.icon className="size-5" />
                  </div>
                  {tile.available ? (
                    <ArrowRight className="size-4 text-gray-300 transition-colors group-hover:text-brand-600" />
                  ) : (
                    <Badge variant="warning" className="text-[10px]">Unavailable</Badge>
                  )}
                </div>
                <div className="mt-3">
                  <p className="text-sm font-semibold text-gray-900">{tile.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{tile.description}</p>
                  {!tile.available && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-700">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                      {tile.unavailableNote}
                    </p>
                  )}
                </div>
              </Card>
            )

            // An unavailable tile is not a link: routing into a workspace that
            // cannot complete a transaction wastes the retailer's time at the
            // counter with a customer waiting.
            return tile.available ? (
              <Link key={tile.to} to={tile.to}>{body}</Link>
            ) : (
              <div key={tile.to}>{body}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}
