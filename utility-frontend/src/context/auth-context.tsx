import * as React from "react"
import { api, tokenStore, setSessionExpiredHandler, ApiError, type SessionUser } from "@/lib/api"
import type { Role } from "@/lib/types"

interface AuthContextValue {
  user: SessionUser | null
  role: Role | null
  isAuthenticated: boolean
  /** True while the stored session is being validated on first load. */
  isLoading: boolean
  /** Resolves on success, throws ApiError on failure so the form can show it. */
  login: (email: string, password: string) => Promise<SessionUser>
  logout: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Seed from storage so a page refresh does not flash the login screen before
  // the session is confirmed.
  const [user, setUser] = React.useState<SessionUser | null>(() => tokenStore.getUser())
  const [isLoading, setIsLoading] = React.useState(() => !!tokenStore.getAccess())

  // A rejected session anywhere in the app clears local state, so the router can
  // redirect to login without every caller handling 401 itself.
  React.useEffect(() => {
    setSessionExpiredHandler(() => setUser(null))
  }, [])

  // Validate the stored token against the server on mount. Storage alone is not
  // proof of a live session: the account may have been suspended or the token
  // revoked since it was issued.
  React.useEffect(() => {
    if (!tokenStore.getAccess()) {
      setIsLoading(false)
      return
    }

    let cancelled = false

    api.auth
      .me()
      .then((fresh) => {
        if (!cancelled) setUser(fresh)
      })
      .catch((err) => {
        if (cancelled) return
        // Only an auth failure invalidates the session. A network blip must not
        // sign the user out, so the cached user is kept in that case.
        if (err instanceof ApiError && err.isAuthError) {
          tokenStore.clear()
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = React.useCallback(async (email: string, password: string) => {
    const session = await api.auth.login(email, password)
    tokenStore.save(session)
    setUser(session.user)
    return session.user
  }, [])

  const logout = React.useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      // Sign-out must succeed locally even if the revoke call fails.
      setUser(null)
    }
  }, [])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      role: user?.role ?? null,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
