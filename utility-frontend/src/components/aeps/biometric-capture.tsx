import * as React from "react"
import { AlertCircle, CheckCircle2, Fingerprint, FlaskConical, Loader2, Usb, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { capture, discoverDevice, RdServiceError, type RdDevice } from "@/lib/rd-service"

/**
 * Fingerprint capture for AEPS.
 *
 * The capture is performed by a UIDAI-certified device through its local RD
 * service, so the PID block is produced on the operator's machine and only the
 * encrypted result is sent onward. Nothing here fabricates a capture: without a
 * device there is no PID block, and the control says so rather than letting the
 * retailer reach the provider with an empty one.
 *
 * A manual paste field is offered as well. Devices differ in how they are
 * deployed — some sites run the RD service behind a vendor's own bridge — and
 * during provider UAT a captured block often has to be replayed. Both routes
 * produce the same value, so the caller does not care which was used.
 */

/**
 * The placeholder the provider's own integration logs use for `pid`.
 *
 * The provider validates that the field is present before it validates the
 * merchant, so this is enough to exercise every request path and see a real
 * provider response without a scanner attached. It cannot produce a successful
 * authentication: only a genuine capture can do that.
 */
const TEST_PID_DATA = "test_pid_data"

/**
 * Whether to offer the test placeholder at all.
 *
 * Tied to the dev build so it cannot reach a production bundle, where a
 * deliberately invalid capture has no legitimate use.
 */
const ALLOW_TEST_PID = import.meta.env.DEV

export function BiometricCapture({
  pidData,
  onChange,
  label = "Biometric authentication",
  hint,
  disabled = false,
}: {
  /** The captured PID block, or "" when nothing has been captured. */
  pidData: string
  onChange: (pidData: string) => void
  label?: string
  hint?: string
  disabled?: boolean
}) {
  const [busy, setBusy] = React.useState(false)
  const [device, setDevice] = React.useState<RdDevice | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [manual, setManual] = React.useState(false)

  const captured = pidData.trim() !== ""
  // Flagged distinctly from a real capture so a screenshot can never be mistaken
  // for evidence of a working biometric.
  const isTestPid = pidData.trim() === TEST_PID_DATA

  async function detect() {
    setBusy(true)
    setError(null)
    try {
      setDevice(await discoverDevice())
    } catch (err) {
      setError(err instanceof RdServiceError ? err.message : "Could not reach a fingerprint device")
    } finally {
      setBusy(false)
    }
  }

  async function scan() {
    setBusy(true)
    setError(null)
    try {
      const result = await capture()
      onChange(result.pidData)
    } catch (err) {
      // The device's own wording is preferred: it tells the operator what to do,
      // e.g. that the finger was placed too lightly.
      setError(err instanceof RdServiceError ? err.message : "Capture failed. Try again.")
    } finally {
      setBusy(false)
    }
  }

  function clear() {
    onChange("")
    setError(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium text-gray-700">
          {label} <span className="text-danger-500">*</span>
        </Label>

        <button
          type="button"
          className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
          onClick={() => setManual((v) => !v)}
        >
          {manual ? "Use the scanner" : "Paste a PID block"}
        </button>
      </div>

      <div
        className={`rounded-lg border-2 p-5 transition-colors ${
          captured
            ? "border-success-300 bg-success-50"
            : error
              ? "border-danger-200 bg-danger-50/50"
              : "border-dashed border-gray-300 bg-gray-50"
        }`}
      >
        {manual ? (
          <div className="space-y-2">
            <Textarea
              value={pidData}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              placeholder="Paste the PidData XML returned by the RD service"
              className="min-h-28 font-mono text-[11px]"
            />
            <p className="text-xs text-gray-500">
              Paste the device's response exactly as it was produced. Reformatting it
              invalidates the signature the device computed over the block.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            {busy ? (
              <>
                <Loader2 className="size-10 animate-spin text-gray-900" />
                <p className="text-sm font-medium text-gray-900">Waiting for the scanner...</p>
                <p className="text-xs text-gray-500">Keep the finger steady on the sensor</p>
              </>
            ) : captured ? (
              <>
                <CheckCircle2 className="size-10 text-success-600" />
                {isTestPid ? (
                  <>
                    <p className="text-sm font-semibold text-amber-700">Test placeholder in use</p>
                    <p className="max-w-sm text-xs text-gray-600">
                      This is not a real capture. The provider will reject the authentication
                      itself, but the request and its response are genuine.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-success-700">Fingerprint captured</p>
                    <p className="text-xs text-gray-600">
                      {pidData.length.toLocaleString()} characters of encrypted PID data
                    </p>
                  </>
                )}
              </>
            ) : (
              <>
                <Fingerprint className="size-10 text-gray-400" />
                <p className="text-sm font-medium text-gray-900">
                  {device ? "Device ready" : "No device detected yet"}
                </p>
                <p className="max-w-sm text-xs text-gray-500">
                  {device
                    ? device.info || "Connected device reported no model information."
                    : "Connect a UIDAI-certified fingerprint device and make sure its RD service is running. Take the customer's consent before capturing."}
                </p>
              </>
            )}

            {error && (
              <p className="flex max-w-sm items-start gap-1.5 text-left text-xs text-danger-700">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2">
              {captured ? (
                <Button type="button" variant="outline" size="sm" onClick={clear} disabled={disabled}>
                  <X className="size-4" /> Capture again
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    onClick={scan}
                    disabled={busy || disabled}
                  >
                    <Fingerprint className="size-4" />
                    {busy ? "Capturing..." : "Capture fingerprint"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={detect}
                    disabled={busy || disabled}
                  >
                    <Usb className="size-4" /> Detect device
                  </Button>
                  {ALLOW_TEST_PID && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onChange(TEST_PID_DATA)}
                      disabled={busy || disabled}
                      title="Sends the provider's documented placeholder instead of a real capture"
                    >
                      <FlaskConical className="size-4" /> Use test data
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
