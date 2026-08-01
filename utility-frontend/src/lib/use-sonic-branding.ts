import * as React from "react"
import { BRAND_ASSETS } from "@/lib/brand"

export type SonicState = "idle" | "playing" | "blocked" | "unavailable"

/**
 * Plays the official Bharat Connect sonic branding clip.
 *
 * NPCI requires the clip to play *simultaneously* with the display of the
 * "B Assured" mark on the Payment Successful screen. Call `play()` in the same
 * effect that mounts the success screen.
 *
 * Browsers block programmatic audio without a prior user gesture. Because the
 * success screen is always reached by the user tapping "Pay", the gesture
 * requirement is normally already satisfied; if playback is still refused the
 * hook reports `"blocked"` so the UI can surface a tap-to-play affordance
 * instead of failing silently.
 */
export function useSonicBranding() {
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const [state, setState] = React.useState<SonicState>("idle")

  React.useEffect(() => {
    const audio = new Audio(BRAND_ASSETS.successAudio)
    audio.preload = "auto"
    audio.addEventListener("error", () => {
      setState("unavailable")
      console.warn(
        `[brand] Official sonic branding clip missing at ${BRAND_ASSETS.successAudio}. ` +
          "NPCI mandates it plays with the B-Assured mark — see /public/brand/README.md."
      )
    })
    audio.addEventListener("ended", () => setState("idle"))
    audioRef.current = audio

    return () => {
      audio.pause()
      audio.src = ""
      audioRef.current = null
    }
  }, [])

  const play = React.useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    try {
      audio.currentTime = 0
      await audio.play()
      setState("playing")
    } catch {
      setState((prev) => (prev === "unavailable" ? prev : "blocked"))
    }
  }, [])

  const stop = React.useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    setState("idle")
  }, [])

  return { play, stop, state, isAvailable: state !== "unavailable" }
}
