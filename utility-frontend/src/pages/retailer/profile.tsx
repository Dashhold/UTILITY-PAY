import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Pencil, Eye, EyeOff, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { ErrorState } from "@/components/shared/error-state"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { useApiQuery, useMutation } from "@/hooks/use-api"
import { api } from "@/lib/api"
import type { RetailerProfile } from "@/lib/api-types"
import { initials, formatDate } from "@/lib/utils"
import { formatMoney } from "@/lib/money"

/**
 * Only the fields the backend accepts on a profile update appear here.
 *
 * Wallet balance, KYC status, merchant code and user type are set by the
 * platform or an admin. Offering them as inputs would create a form whose
 * submissions are silently discarded.
 */
const outletSchema = z.object({
  shopName: z.string().min(2, "Shop name must be at least 2 characters"),
  firmName: z.string().min(2, "Firm name must be at least 2 characters"),
  addressLine: z.string().min(5, "Address must be at least 5 characters"),
  city: z.string().min(2, "City is required"),
  state: z.string().min(2, "State is required"),
  pincode: z.string().regex(/^\d{6}$/, "Pincode must be 6 digits"),
})
type OutletForm = z.infer<typeof outletSchema>

const bankSchema = z.object({
  bankAccountName: z.string().min(2, "Account holder name is required"),
  bankAccountNumber: z.string().regex(/^\d{9,18}$/, "Account number must be 9-18 digits"),
  bankIfsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code (e.g. HDFC0001234)"),
  bankName: z.string().min(2, "Bank name is required"),
})
type BankForm = z.infer<typeof bankSchema>

const nomineeSchema = z.object({
  nomineeName: z.string().min(2, "Nominee name is required"),
  nomineeRelation: z.string().min(1, "Select a relation"),
  nomineeContact: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
})
type NomineeForm = z.infer<typeof nomineeSchema>

const RELATIONS = ["Spouse", "Father", "Mother", "Son", "Daughter", "Brother", "Sister"]

const INDIAN_STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chandigarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand",
  "West Bengal",
]

export function ProfilePage() {
  const query = useApiQuery(() => api.retailer.profile(), [])
  const profile = query.data

  const [outletOpen, setOutletOpen] = React.useState(false)
  const [bankOpen, setBankOpen] = React.useState(false)
  const [nomineeOpen, setNomineeOpen] = React.useState(false)
  const [showAccountNumber, setShowAccountNumber] = React.useState(false)

  const save = useMutation(
    (patch: Partial<RetailerProfile>) => api.retailer.updateProfile(patch),
    { successMessage: "Profile updated", onSuccess: () => query.refetch() },
  )

  async function submit(patch: Partial<RetailerProfile>, close: () => void) {
    // The dialog stays open on failure so a rejected value can be corrected
    // rather than retyped.
    const result = await save.run(patch)
    if (result !== undefined) close()
  }

  if (query.error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="My Profile" description="Your account, outlet, bank and nominee details" />
        <ErrorState description={query.error} onRetry={query.refetch} />
      </div>
    )
  }

  if (query.loading || !profile) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="My Profile" description="Your account, outlet, bank and nominee details" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </Card>
        ))}
      </div>
    )
  }

  const accountNumber = profile.bankAccountNumber ?? ""
  const maskedAccount =
    accountNumber === ""
      ? "Not provided"
      : showAccountNumber
        ? accountNumber
        : `${"•".repeat(Math.max(accountNumber.length - 4, 0))}${accountNumber.slice(-4)}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My Profile" description="Your account, outlet, bank and nominee details" />

      <Card>
        <CardContent className="flex flex-col items-start gap-5 p-5 sm:flex-row sm:items-center">
          <Avatar className="size-20">
            <AvatarFallback className="text-lg">{initials(profile.name)}</AvatarFallback>
          </Avatar>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">{profile.name}</h2>
              <StatusBadge status={profile.status} />
              <Badge variant={profile.kycStatus === "verified" ? "success" : "warning"} className="text-[11px]">
                KYC {profile.kycStatus.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-sm text-gray-500">{profile.shopName || profile.firmName || "Outlet name not set"}</p>
            <p className="mt-1 text-xs text-gray-400">
              Merchant code {profile.merchantCode} · {profile.userType || "Retailer"} · Joined{" "}
              {formatDate(profile.joinedDate)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs font-medium text-gray-500">Wallet balance</p>
            <p className="table-num text-xl font-semibold text-gray-900">{formatMoney(profile.walletBalance)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>
            Name, email and phone are tied to your login. Contact support to change them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField label="Full Name" value={profile.name} />
            <InfoField label="Email Address" value={profile.email} />
            <InfoField label="Phone Number" value={profile.phone} />
            <InfoField label="Merchant Code" value={profile.merchantCode} />
            <InfoField label="PAN" value={profile.pan || "Not provided"} />
            <InfoField label="GSTIN" value={profile.gstin || "Not provided"} />
            <InfoField
              label="Aadhaar"
              value={profile.aadhaarLast4 ? `•••• •••• ${profile.aadhaarLast4}` : "Not provided"}
            />
            <InfoField
              label="AEPS Onboarding"
              value={
                <span className="flex items-center gap-1.5">
                  {profile.aepsOnboardStatus === "completed" && <ShieldCheck className="size-3.5 text-success-600" />}
                  {profile.aepsOnboardStatus.replace(/_/g, " ")}
                  {profile.aepsOnboardedAt && (
                    <span className="text-xs text-gray-400">· {formatDate(profile.aepsOnboardedAt)}</span>
                  )}
                </span>
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Outlet Details</CardTitle>
            <CardDescription>Where you operate from</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOutletOpen(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField label="Shop Name" value={profile.shopName || "Not set"} />
            <InfoField label="Firm Name" value={profile.firmName || "Not set"} />
            <InfoField label="City" value={profile.city || "Not set"} />
            <InfoField label="State" value={profile.state || "Not set"} />
            <InfoField label="Pincode" value={profile.pincode || "Not set"} />
            <InfoField label="Address" value={profile.addressLine || "Not set"} className="sm:col-span-2" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Bank Details</CardTitle>
            <CardDescription>Settlement account for commission payouts</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setBankOpen(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField label="Account Holder" value={profile.bankAccountName || "Not provided"} />
            <InfoField
              label="Account Number"
              value={
                <span className="flex items-center gap-2">
                  <span className="table-num">{maskedAccount}</span>
                  {accountNumber !== "" && (
                    <button
                      type="button"
                      onClick={() => setShowAccountNumber((s) => !s)}
                      className="text-gray-400 hover:text-gray-700"
                      aria-label={showAccountNumber ? "Hide account number" : "Show account number"}
                    >
                      {showAccountNumber ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  )}
                </span>
              }
            />
            <InfoField label="IFSC Code" value={profile.bankIfsc || "Not provided"} />
            <InfoField label="Bank Name" value={profile.bankName || "Not provided"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Nominee Details</CardTitle>
            <CardDescription>Nominee information for your account</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setNomineeOpen(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField label="Nominee Name" value={profile.nomineeName || "Not provided"} />
            <InfoField label="Relation" value={profile.nomineeRelation || "Not provided"} />
            <InfoField label="Contact" value={profile.nomineeContact || "Not provided"} />
          </div>
        </CardContent>
      </Card>

      <EditOutletSheet
        open={outletOpen}
        onOpenChange={setOutletOpen}
        profile={profile}
        pending={save.pending}
        onSave={(values) => submit(values, () => setOutletOpen(false))}
      />
      <EditBankDialog
        open={bankOpen}
        onOpenChange={setBankOpen}
        profile={profile}
        pending={save.pending}
        onSave={(values) => submit(values, () => setBankOpen(false))}
      />
      <EditNomineeDialog
        open={nomineeOpen}
        onOpenChange={setNomineeOpen}
        profile={profile}
        pending={save.pending}
        onSave={(values) => submit(values, () => setNomineeOpen(false))}
      />
    </div>
  )
}

function InfoField({
  label, value, className,
}: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
    </div>
  )
}

function EditOutletSheet({
  open, onOpenChange, profile, pending, onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: RetailerProfile
  pending: boolean
  onSave: (values: OutletForm) => void
}) {
  const form = useForm<OutletForm>({
    resolver: zodResolver(outletSchema),
    values: {
      shopName: profile.shopName ?? "",
      firmName: profile.firmName ?? "",
      addressLine: profile.addressLine ?? "",
      city: profile.city ?? "",
      state: profile.state ?? "",
      pincode: profile.pincode ?? "",
    },
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Outlet Details</SheetTitle>
          <SheetDescription>Update where you operate from</SheetDescription>
        </SheetHeader>
        <form
          id="outlet-form"
          className="flex flex-1 flex-col gap-4 overflow-y-auto py-2"
          onSubmit={form.handleSubmit(onSave)}
        >
          <Field label="Shop Name" error={form.formState.errors.shopName?.message}>
            <Input {...form.register("shopName")} />
          </Field>
          <Field label="Firm Name" error={form.formState.errors.firmName?.message}>
            <Input {...form.register("firmName")} />
          </Field>
          <Field label="Address" error={form.formState.errors.addressLine?.message}>
            <Input {...form.register("addressLine")} />
          </Field>
          <Field label="City" error={form.formState.errors.city?.message}>
            <Input {...form.register("city")} />
          </Field>
          <Field label="State" error={form.formState.errors.state?.message}>
            <Select
              value={form.watch("state")}
              onValueChange={(v) => form.setValue("state", v, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Pincode" error={form.formState.errors.pincode?.message}>
            <Input maxLength={6} {...form.register("pincode")} />
          </Field>
        </form>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="outlet-form" variant="brand" disabled={pending}>
            Save Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function EditBankDialog({
  open, onOpenChange, profile, pending, onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: RetailerProfile
  pending: boolean
  onSave: (values: BankForm) => void
}) {
  const form = useForm<BankForm>({
    resolver: zodResolver(bankSchema),
    values: {
      bankAccountName: profile.bankAccountName ?? "",
      bankAccountNumber: profile.bankAccountNumber ?? "",
      bankIfsc: profile.bankIfsc ?? "",
      bankName: profile.bankName ?? "",
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Bank Details</DialogTitle>
          <DialogDescription>
            Commission payouts settle to this account, so double-check the number and IFSC.
          </DialogDescription>
        </DialogHeader>
        <form id="bank-form" className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSave)}>
          <Field label="Account Holder Name" error={form.formState.errors.bankAccountName?.message}>
            <Input {...form.register("bankAccountName")} />
          </Field>
          <Field label="Account Number" error={form.formState.errors.bankAccountNumber?.message}>
            <Input inputMode="numeric" {...form.register("bankAccountNumber")} />
          </Field>
          <Field label="IFSC Code" error={form.formState.errors.bankIfsc?.message}>
            <Input
              className="uppercase"
              {...form.register("bankIfsc", {
                onChange: (e) => {
                  e.target.value = e.target.value.toUpperCase()
                },
              })}
            />
          </Field>
          <Field label="Bank Name" error={form.formState.errors.bankName?.message}>
            <Input {...form.register("bankName")} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="bank-form" variant="brand" disabled={pending}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditNomineeDialog({
  open, onOpenChange, profile, pending, onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: RetailerProfile
  pending: boolean
  onSave: (values: NomineeForm) => void
}) {
  const form = useForm<NomineeForm>({
    resolver: zodResolver(nomineeSchema),
    values: {
      nomineeName: profile.nomineeName ?? "",
      nomineeRelation: profile.nomineeRelation ?? "",
      nomineeContact: profile.nomineeContact ?? "",
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Nominee Details</DialogTitle>
          <DialogDescription>Nominee information for your account</DialogDescription>
        </DialogHeader>
        <form id="nominee-form" className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSave)}>
          <Field label="Nominee Name" error={form.formState.errors.nomineeName?.message}>
            <Input {...form.register("nomineeName")} />
          </Field>
          <Field label="Relation" error={form.formState.errors.nomineeRelation?.message}>
            <Select
              value={form.watch("nomineeRelation")}
              onValueChange={(v) => form.setValue("nomineeRelation", v, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select relation" />
              </SelectTrigger>
              <SelectContent>
                {RELATIONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Contact Number" error={form.formState.errors.nomineeContact?.message}>
            <Input maxLength={10} inputMode="numeric" {...form.register("nomineeContact")} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="nominee-form" variant="brand" disabled={pending}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Label, control and error message in the layout used across these forms. */
function Field({
  label, error, children,
}: { label: string; error?: string; children: React.ReactNode }) {
  const id = React.useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-danger-500">{error}</p>}
    </div>
  )
}
