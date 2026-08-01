import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  Check, Loader2, ShieldCheck, UploadCloud, CreditCard, Fingerprint, Receipt,
  Landmark, ImageIcon, FileCheck2, Clock, FileWarning, Trash2, Eye,
} from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorState } from "@/components/shared/error-state"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { useApiQuery, useMutation } from "@/hooks/use-api"
import { api, ApiError } from "@/lib/api"
import type { KycApplication, KycDocType, KycDocument } from "@/lib/api-types"
import { cn, formatDate } from "@/lib/utils"

/**
 * The wizard steps.
 *
 * Each step maps onto something the backend actually stores: an identity number
 * it persists, or a document type it accepts. A step with no server counterpart
 * would collect data that silently vanishes on reload.
 */
interface StepConfig {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Documents this step is responsible for. */
  docTypes: KycDocType[]
}

const STEPS: StepConfig[] = [
  { id: "pan", label: "PAN", icon: CreditCard, docTypes: ["pan"] },
  { id: "aadhaar", label: "Aadhaar", icon: Fingerprint, docTypes: ["aadhaar_front", "aadhaar_back"] },
  { id: "gst", label: "GST", icon: Receipt, docTypes: ["gst"] },
  { id: "bank", label: "Bank Proof", icon: Landmark, docTypes: ["cancelled_cheque"] },
  { id: "shop", label: "Shop Images", icon: ImageIcon, docTypes: ["shop_photo", "shop_interior"] },
  { id: "address", label: "Address Proof", icon: FileCheck2, docTypes: ["address_proof"] },
]

const DOC_LABELS: Record<KycDocType, string> = {
  pan: "PAN card",
  aadhaar_front: "Aadhaar (front)",
  aadhaar_back: "Aadhaar (back)",
  shop_photo: "Shop front with signboard",
  shop_interior: "Shop interior",
  address_proof: "Address proof (electricity bill or rent agreement)",
  cancelled_cheque: "Cancelled cheque or passbook",
  gst: "GST certificate",
  other: "Other",
}

const panSchema = z.object({
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN (e.g. ABCDE1234F)"),
})
const aadhaarSchema = z.object({
  aadhaar: z.string().regex(/^\d{12}$/, "Aadhaar number must be exactly 12 digits"),
})
const gstSchema = z
  .object({
    noGst: z.boolean(),
    gstin: z.string(),
  })
  .refine(
    (d) => d.noGst || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(d.gstin),
    { message: "Enter a valid 15-character GSTIN", path: ["gstin"] },
  )

export function KycPage() {
  const query = useApiQuery(() => api.kyc.application(), [])
  const application = query.data

  const [step, setStep] = React.useState(0)

  const locked =
    application?.status === "pending" || application?.status === "verified"

  const submit = useMutation(() => api.kyc.submit(), {
    successMessage: "KYC submitted for review",
    onSuccess: () => query.refetch(),
  })

  if (query.error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="KYC Verification" description="Complete your KYC to activate all services" />
        <ErrorState description={query.error} onRetry={query.refetch} />
      </div>
    )
  }

  if (query.loading || !application) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="KYC Verification" description="Complete your KYC to activate all services" />
        <Card className="p-5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </Card>
      </div>
    )
  }

  const loaded: KycApplication = application
  const documents = loaded.documents ?? []
  const missing = new Set(loaded.missingDocTypes)

  /** A step is done when none of its required documents are outstanding. */
  function isStepComplete(config: StepConfig): boolean {
    const required = config.docTypes.filter((t) => REQUIRED_TYPES.has(t))
    if (required.length === 0) {
      // An all-optional step (GST) counts as done once something is uploaded or
      // the retailer has said they have no GST.
      return config.docTypes.some((t) => documents.some((d) => d.docType === t)) || loaded.gstin !== ""
    }
    return required.every((t) => !missing.has(t))
  }

  const current = STEPS[step]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="KYC Verification"
        description="Complete your KYC to activate all services on your account"
      />

      <StatusBanner application={application} />

      <Card>
        <CardContent className="overflow-x-auto p-5">
          <div className="flex min-w-max items-start">
            {STEPS.map((config, idx) => {
              const complete = isStepComplete(config)
              const isCurrent = idx === step
              return (
                <React.Fragment key={config.id}>
                  <button
                    type="button"
                    onClick={() => setStep(idx)}
                    className="flex w-28 flex-col items-center gap-2 text-center"
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                        complete && "border-brand-500 bg-brand-500 text-black",
                        isCurrent && !complete && "border-brand-500 bg-white text-brand-700",
                        !complete && !isCurrent && "border-gray-200 bg-white text-gray-400",
                      )}
                    >
                      {complete ? <Check className="size-4" /> : idx + 1}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-medium leading-tight",
                        isCurrent ? "text-gray-900" : "text-gray-500",
                      )}
                    >
                      {config.label}
                    </span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div className={cn("mt-4.5 h-0.5 w-8 shrink-0 sm:w-12", complete ? "bg-brand-500" : "bg-gray-200")} />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {current.id === "pan" && (
        <PanStep application={application} locked={locked} onChanged={query.refetch} />
      )}
      {current.id === "aadhaar" && (
        <AadhaarStep application={application} locked={locked} onChanged={query.refetch} />
      )}
      {current.id === "gst" && (
        <GstStep application={application} locked={locked} onChanged={query.refetch} />
      )}
      {current.id === "bank" && (
        <DocumentStep
          title="Bank Proof"
          description="Upload a cancelled cheque or the front page of your passbook"
          docTypes={["cancelled_cheque"]}
          application={application}
          locked={locked}
          onChanged={query.refetch}
        />
      )}
      {current.id === "shop" && (
        <DocumentStep
          title="Shop Images"
          description="A clear photo of your shop front with the signboard visible. Interior is optional."
          docTypes={["shop_photo", "shop_interior"]}
          application={application}
          locked={locked}
          onChanged={query.refetch}
        />
      )}
      {current.id === "address" && (
        <DocumentStep
          title="Address Proof"
          description="A recent electricity bill or your rent agreement"
          docTypes={["address_proof"]}
          application={application}
          locked={locked}
          onChanged={query.refetch}
        />
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="brand" onClick={() => setStep((s) => s + 1)}>Next</Button>
        ) : (
          <Button
            variant="brand"
            disabled={!application.canSubmit || submit.pending}
            onClick={() => {
              if (!application.canSubmit) {
                toast.error(
                  application.missingDocTypes.length > 0
                    ? `Still needed: ${application.missingDocTypes.map((t) => DOC_LABELS[t]).join(", ")}`
                    : "This application cannot be submitted right now",
                )
                return
              }
              void submit.run()
            }}
          >
            {submit.pending && <Loader2 className="size-3.5 animate-spin" />}
            Submit for Review
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Outstanding Items</CardTitle>
          <CardDescription>
            {application.missingDocTypes.length === 0
              ? "Everything required has been uploaded."
              : "These are still needed before you can submit."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {application.missingDocTypes.length === 0 ? (
            <Badge variant="success" dot>
              <ShieldCheck className="size-3.5" /> Ready to submit
            </Badge>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {application.missingDocTypes.map((docType) => (
                <li key={docType} className="flex items-center gap-2 text-sm text-gray-700">
                  <FileWarning className="size-3.5 text-warning-600" />
                  {DOC_LABELS[docType]}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Mirrors the server's required set so the UI can tell required from optional. */
const REQUIRED_TYPES = new Set<KycDocType>([
  "pan", "aadhaar_front", "aadhaar_back", "shop_photo", "address_proof", "cancelled_cheque",
])

function StatusBanner({ application }: { application: KycApplication }) {
  if (application.status === "verified") {
    return (
      <Card className="border-success-500/30 bg-success-50/40">
        <CardContent className="flex items-center gap-3 p-4">
          <ShieldCheck className="size-5 text-success-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">KYC verified</p>
            <p className="text-xs text-gray-600">
              All services are active on your account
              {application.reviewedAt ? ` · verified ${formatDate(application.reviewedAt)}` : ""}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (application.status === "pending") {
    return (
      <Card className="border-warning-500/30 bg-warning-50/40">
        <CardContent className="flex items-center gap-3 p-4">
          <Clock className="size-5 text-warning-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Under review</p>
            <p className="text-xs text-gray-600">
              Submitted{application.submittedAt ? ` ${formatDate(application.submittedAt)}` : ""}. Your documents are
              locked while our team reviews them.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (application.status === "rejected") {
    return (
      <Card className="border-danger-500/30 bg-danger-50/40">
        <CardContent className="flex items-start gap-3 p-4">
          <FileWarning className="size-5 shrink-0 text-danger-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">KYC rejected</p>
            <p className="text-xs text-gray-600">
              {application.rejectReason || "Please correct the documents below and submit again."}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return null
}

interface StepProps {
  application: KycApplication
  locked: boolean
  onChanged: () => void
}

function PanStep({ application, locked, onChanged }: StepProps) {
  const form = useForm<z.infer<typeof panSchema>>({
    resolver: zodResolver(panSchema),
    values: { pan: application.pan },
  })

  const save = useMutation(
    (pan: string) => api.kyc.saveProgress({ pan, currentStep: 1 }),
    { successMessage: "PAN saved", onSuccess: onChanged },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>PAN Details</CardTitle>
        <CardDescription>Your PAN as printed on the card, plus a scan of it</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form
          className="flex flex-col gap-3 sm:max-w-sm"
          onSubmit={form.handleSubmit((v) => void save.run(v.pan))}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pan">PAN Number</Label>
            <Input
              id="pan"
              maxLength={10}
              disabled={locked}
              className="uppercase"
              placeholder="ABCDE1234F"
              {...form.register("pan", {
                onChange: (e) => {
                  e.target.value = e.target.value.toUpperCase()
                },
              })}
            />
            {form.formState.errors.pan && (
              <p className="text-xs text-danger-500">{form.formState.errors.pan.message}</p>
            )}
          </div>
          <div>
            <Button type="submit" variant="brand" size="sm" disabled={locked || save.pending}>
              {save.pending && <Loader2 className="size-3.5 animate-spin" />} Save PAN
            </Button>
          </div>
        </form>

        <DocumentSlot docType="pan" application={application} locked={locked} onChanged={onChanged} />
      </CardContent>
    </Card>
  )
}

function AadhaarStep({ application, locked, onChanged }: StepProps) {
  const form = useForm<z.infer<typeof aadhaarSchema>>({
    resolver: zodResolver(aadhaarSchema),
    defaultValues: { aadhaar: "" },
  })

  const save = useMutation(
    (aadhaar: string) => api.kyc.saveProgress({ aadhaar, currentStep: 2 }),
    { successMessage: "Aadhaar saved", onSuccess: onChanged },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aadhaar Details</CardTitle>
        <CardDescription>
          Only the last four digits are stored. Enter the full number once so we can match it to your scan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {application.aadhaarLast4 && (
          <p className="text-sm text-gray-700">
            On file: <span className="table-num font-medium">•••• •••• {application.aadhaarLast4}</span>
          </p>
        )}

        <form
          className="flex flex-col gap-3 sm:max-w-sm"
          onSubmit={form.handleSubmit((v) => void save.run(v.aadhaar))}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aadhaar">Aadhaar Number</Label>
            <Input
              id="aadhaar"
              maxLength={12}
              inputMode="numeric"
              disabled={locked}
              placeholder="12 digits"
              {...form.register("aadhaar")}
            />
            {form.formState.errors.aadhaar && (
              <p className="text-xs text-danger-500">{form.formState.errors.aadhaar.message}</p>
            )}
          </div>
          <div>
            <Button type="submit" variant="brand" size="sm" disabled={locked || save.pending}>
              {save.pending && <Loader2 className="size-3.5 animate-spin" />} Save Aadhaar
            </Button>
          </div>
        </form>

        <DocumentSlot docType="aadhaar_front" application={application} locked={locked} onChanged={onChanged} />
        <DocumentSlot docType="aadhaar_back" application={application} locked={locked} onChanged={onChanged} />
      </CardContent>
    </Card>
  )
}

function GstStep({ application, locked, onChanged }: StepProps) {
  const form = useForm<z.infer<typeof gstSchema>>({
    resolver: zodResolver(gstSchema),
    defaultValues: { noGst: application.gstin === "", gstin: application.gstin },
  })
  const noGst = form.watch("noGst")

  const save = useMutation(
    (gstin: string) => api.kyc.saveProgress({ gstin, currentStep: 3 }),
    { successMessage: "GSTIN saved", onSuccess: onChanged },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>GST Details</CardTitle>
        <CardDescription>
          Optional. Your GSTIN appears on the GST report, so add it if you are registered.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form
          className="flex flex-col gap-3 sm:max-w-sm"
          onSubmit={form.handleSubmit((v) => {
            if (v.noGst) {
              toast.info("Skipping GST. You can add it later from this page.")
              return
            }
            void save.run(v.gstin)
          })}
        >
          <div className="flex items-center gap-2">
            <Checkbox
              id="no-gst"
              checked={noGst}
              disabled={locked}
              onCheckedChange={(checked) => form.setValue("noGst", checked === true, { shouldValidate: true })}
            />
            <Label htmlFor="no-gst" className="font-normal">I am not GST registered</Label>
          </div>

          {!noGst && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                maxLength={15}
                disabled={locked}
                className="uppercase"
                placeholder="27ABCDE1234F1Z5"
                {...form.register("gstin", {
                  onChange: (e) => {
                    e.target.value = e.target.value.toUpperCase()
                  },
                })}
              />
              {form.formState.errors.gstin && (
                <p className="text-xs text-danger-500">{form.formState.errors.gstin.message}</p>
              )}
            </div>
          )}

          <div>
            <Button type="submit" variant="brand" size="sm" disabled={locked || save.pending}>
              {save.pending && <Loader2 className="size-3.5 animate-spin" />}
              {noGst ? "Skip GST" : "Save GSTIN"}
            </Button>
          </div>
        </form>

        {!noGst && (
          <DocumentSlot docType="gst" application={application} locked={locked} onChanged={onChanged} />
        )}
      </CardContent>
    </Card>
  )
}

function DocumentStep({
  title, description, docTypes, application, locked, onChanged,
}: StepProps & { title: string; description: string; docTypes: KycDocType[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {docTypes.map((docType) => (
          <DocumentSlot
            key={docType}
            docType={docType}
            application={application}
            locked={locked}
            onChanged={onChanged}
          />
        ))}
      </CardContent>
    </Card>
  )
}

/**
 * One upload slot.
 *
 * Shows the stored document when present rather than a generic "uploaded" flag,
 * so a retailer can confirm the right file went up and replace a bad scan.
 */
function DocumentSlot({
  docType, application, locked, onChanged,
}: { docType: KycDocType; application: KycApplication; locked: boolean; onChanged: () => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)

  const existing = (application.documents ?? []).find((d) => d.docType === docType)
  const required = REQUIRED_TYPES.has(docType)

  // The object URL is revoked on unmount and whenever it is replaced, otherwise
  // each preview would leak the whole file into memory for the session.
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // The input is reset so choosing the same file twice still fires a change.
    event.target.value = ""
    if (!file) return

    setUploading(true)
    try {
      await api.kyc.uploadDocument(docType, file)
      toast.success(`${DOC_LABELS[docType]} uploaded`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "The upload failed. Try again.")
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove(doc: KycDocument) {
    try {
      await api.kyc.deleteDocument(doc.id)
      toast.success(`${DOC_LABELS[docType]} removed`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "The document could not be removed")
    }
  }

  async function handlePreview(doc: KycDocument) {
    try {
      const url = await api.kyc.documentPreviewUrl(doc.id)
      setPreviewUrl(url)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That file could not be opened")
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Label>{DOC_LABELS[docType]}</Label>
        {required ? (
          <Badge variant="outline" className="text-[10px]">Required</Badge>
        ) : (
          <Badge variant="default" className="text-[10px]">Optional</Badge>
        )}
        {existing?.status === "rejected" && (
          <Badge variant="danger" className="text-[10px]">Rejected</Badge>
        )}
        {existing?.status === "verified" && (
          <Badge variant="success" className="text-[10px]">Verified</Badge>
        )}
      </div>

      {existing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">{existing.name}</p>
            <p className="text-xs text-gray-500">
              {(existing.fileSize / 1024).toFixed(0)} KB · uploaded {formatDate(existing.uploadedAt)}
            </p>
            {existing.remarks && (
              <p className="mt-1 text-xs text-danger-600">Reviewer note: {existing.remarks}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void handlePreview(existing)}>
              <Eye className="size-3.5" /> View
            </Button>
            {!locked && (
              <>
                <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
                  {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
                  Replace
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-danger-600 hover:bg-danger-50"
                  onClick={() => void handleRemove(existing)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={locked || uploading}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50/60 px-4 py-6 text-center hover:border-brand-500 hover:bg-brand-50/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin text-gray-400" />
          ) : (
            <UploadCloud className="size-5 text-gray-400" />
          )}
          <span className="text-xs text-gray-500">
            {uploading ? "Uploading…" : "Click to upload (JPG, PNG, WebP or PDF, up to 5 MB)"}
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => void handleFile(e)}
      />
    </div>
  )
}
