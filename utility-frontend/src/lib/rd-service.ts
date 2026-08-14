/**
 * UIDAI Registered Device (RD) service bridge.
 *
 * AEPS authentication requires a fingerprint captured by a UIDAI-certified
 * device. Certified devices expose a local HTTP service — the RD service — that
 * the browser talks to directly; the biometric never passes through our servers
 * in raw form and the encrypted PID block it returns is what the AEPS provider
 * consumes.
 *
 * # Protocol
 *
 * The RD service is not a REST API. It listens on an unspecified port within a
 * fixed range and responds to two custom HTTP methods:
 *
 *   RDSERVICE http://127.0.0.1:<port>/   discovery; returns status and the
 *                                        capture path for this device
 *   CAPTURE   http://127.0.0.1:<port><capturePath>
 *                                        capture; body is a PidOptions XML
 *                                        document, response is a PidData one
 *
 * Both are permitted by fetch(), and http://127.0.0.1 counts as a secure context
 * so a page served over HTTPS may call it without a mixed-content failure.
 *
 * # Why the port is scanned
 *
 * The port is assigned by whichever RD service is installed and is not
 * discoverable any other way. Probing the published range is the mechanism the
 * specification itself prescribes.
 */

/** The port range reserved for RD services by the UIDAI specification. */
const PORT_RANGE_START = 11100
const PORT_RANGE_END = 11120

/**
 * Discovery must not hang on a port with nothing listening. A short timeout is
 * safe: the RD service is a local process and answers immediately.
 */
const DISCOVERY_TIMEOUT_MS = 1500

/**
 * Capture is bounded by how long the operator takes to place a finger, which the
 * device itself also enforces via PidOptions timeout.
 */
const CAPTURE_TIMEOUT_MS = 30_000

/** A discovered RD service. */
export interface RdDevice {
  /** Base URL of the local service, e.g. "http://127.0.0.1:11100". */
  baseUrl: string
  /** Path the CAPTURE method must be sent to, as advertised by the device. */
  capturePath: string
  /** Vendor/model string the device reports, shown so the operator can confirm it. */
  info: string
  /** The device's own status, "READY" when it can capture. */
  status: string
}

/** A completed capture. */
export interface RdCapture {
  /**
   * The PidData XML document exactly as the device produced it.
   *
   * It is forwarded to the provider unmodified. Re-encoding it would invalidate
   * the HMAC the device computed over the block.
   */
  pidData: string
  /** The device's serial number, from DeviceInfo/@dpId, when present. */
  deviceCode: string
}

/** Raised when no usable device is present or a capture could not complete. */
export class RdServiceError extends Error {
  /** True when the failure is the operator's to fix, e.g. no device plugged in. */
  readonly actionable: boolean

  constructor(message: string, actionable = true) {
    super(message)
    this.name = "RdServiceError"
    this.actionable = actionable
  }
}

/**
 * Sends one request to the local RD service.
 *
 * Custom HTTP methods and an AbortSignal timeout are the only unusual parts; the
 * rest is a plain fetch. Errors are normalised because a refused connection and
 * a CORS rejection both surface as an opaque TypeError.
 */
async function rdFetch(
  url: string,
  method: string,
  timeoutMs: number,
  body?: string,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method,
      body,
      headers: body ? { "Content-Type": "text/xml; charset=UTF-8" } : undefined,
      signal: controller.signal,
      // The RD service is a separate origin and sets no credentials.
      mode: "cors",
      cache: "no-store",
    })
    if (!res.ok) {
      throw new RdServiceError(`The device returned HTTP ${res.status}`)
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Parses an XML document, returning null when it is not well-formed. */
function parseXml(xml: string): Document | null {
  const doc = new DOMParser().parseFromString(xml, "text/xml")
  return doc.querySelector("parsererror") ? null : doc
}

/**
 * Finds the first ready RD service on the local machine.
 *
 * Ports are probed concurrently rather than in sequence: a serial scan of the
 * full range would take up to twenty timeouts before reporting a missing device.
 */
export async function discoverDevice(): Promise<RdDevice> {
  const ports: number[] = []
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) ports.push(port)

  const probes = ports.map(async (port): Promise<RdDevice> => {
    const baseUrl = `http://127.0.0.1:${port}`
    const xml = await rdFetch(`${baseUrl}/`, "RDSERVICE", DISCOVERY_TIMEOUT_MS)

    const doc = parseXml(xml)
    const service = doc?.querySelector("RDService")
    if (!service) throw new Error(`no RDService on ${port}`)

    const status = service.getAttribute("status") ?? ""
    if (status.toUpperCase() !== "READY") {
      throw new Error(`device on ${port} reports ${status}`)
    }

    // The capture path is advertised per device rather than fixed, so it is read
    // from the interface list instead of assumed to be /rd/capture.
    const capturePath =
      Array.from(doc?.querySelectorAll("Interface") ?? [])
        .find((el) => el.getAttribute("id")?.toUpperCase() === "CAPTURE")
        ?.getAttribute("path") ?? "/rd/capture"

    return { baseUrl, capturePath, info: service.getAttribute("info") ?? "", status }
  })

  try {
    // The first port to answer READY wins; the rest are abandoned.
    return await Promise.any(probes)
  } catch {
    throw new RdServiceError(
      "No fingerprint device was found. Connect a UIDAI-certified device, " +
        "make sure its RD service is running, and try again.",
    )
  }
}

/**
 * Builds the PidOptions document the device is asked to capture against.
 *
 * `fType="0"` is FMR-free PID with format 0, `pidVer="2.0"` and `env` are what
 * AEPS requires; env is "P" for production because the AEPS provider's own host
 * validates against UIDAI production, not the staging environment.
 */
function pidOptions(): string {
  return (
    '<?xml version="1.0"?>' +
    '<PidOptions ver="1.0">' +
    '<Opts fCount="1" fType="0" iCount="0" pCount="0" format="0" ' +
    'pidVer="2.0" timeout="20000" posh="UNKNOWN" env="P" wadh="" />' +
    "</PidOptions>"
  )
}

/**
 * Captures a fingerprint and returns the encrypted PID block.
 *
 * The device reports business failures inside a well-formed response rather than
 * as an HTTP error, so the response's own errCode is authoritative.
 */
export async function captureBiometric(device: RdDevice): Promise<RdCapture> {
  const xml = await rdFetch(
    `${device.baseUrl}${device.capturePath}`,
    "CAPTURE",
    CAPTURE_TIMEOUT_MS,
    pidOptions(),
  )

  const doc = parseXml(xml)
  if (!doc) {
    throw new RdServiceError("The device returned a response that could not be read.", false)
  }

  const resp = doc.querySelector("Resp")
  const errCode = resp?.getAttribute("errCode") ?? ""
  if (errCode !== "0") {
    // errInfo is written for the operator, so it is preferred over our own text.
    const errInfo = resp?.getAttribute("errInfo")?.trim()
    throw new RdServiceError(errInfo || `Capture failed with device error ${errCode || "unknown"}.`)
  }

  // A response with no Data element cannot be sent upstream, and failing here is
  // clearer than having the provider reject an empty pid.
  if (!doc.querySelector("Data")?.textContent?.trim()) {
    throw new RdServiceError("The device returned no fingerprint data. Capture again.", false)
  }

  return {
    pidData: xml,
    deviceCode: doc.querySelector("DeviceInfo")?.getAttribute("dpId") ?? "",
  }
}

/** Discovers a device and captures in one step, which is what every caller wants. */
export async function capture(): Promise<RdCapture> {
  return captureBiometric(await discoverDevice())
}
