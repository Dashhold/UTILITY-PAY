/**
 * Data-fetching hooks.
 *
 * Every admin and retailer page needs the same four things: load, show a
 * loading state, show an error, and refetch after a mutation. Implementing that
 * once here keeps ~30 pages from each inventing their own, and means the
 * cancellation and error handling are correct in one place rather than thirty.
 */

import * as React from "react"
import { toast } from "sonner"
import { ApiError, type Paginated } from "@/lib/api"

export interface QueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** Re-runs the fetch. Safe to call from an event handler. */
  refetch: () => void
}

/**
 * Runs an async fetch and tracks its state.
 *
 * `deps` controls when the fetch re-runs. The fetcher is intentionally not part
 * of the dependency list: callers usually pass an inline arrow, which would
 * change identity every render and loop forever.
 */
export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
  options: { showErrorToast?: boolean } = {},
): QueryState<T> {
  const { showErrorToast = true } = options

  const [data, setData] = React.useState<T | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  // Held in a ref so a re-render with a new inline fetcher does not retrigger
  // the effect, while the effect still calls the latest version.
  const fetcherRef = React.useRef(fetcher)
  fetcherRef.current = fetcher

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: unknown) => {
        if (cancelled) return

        const message = err instanceof ApiError ? err.message : "Something went wrong"
        setError(message)
        // A 401 is already handled globally by the API client's refresh and
        // session-expiry path, so surfacing it again would double-notify.
        if (showErrorToast && !(err instanceof ApiError && err.isAuthError)) {
          toast.error(message)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const refetch = React.useCallback(() => setTick((n) => n + 1), [])

  return { data, loading, error, refetch }
}

export interface PagedState<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  loading: boolean
  error: string | null
  setPage: (page: number) => void
  refetch: () => void
}

/** Runs a paginated fetch and tracks page state alongside it. */
export function useApiList<T>(
  fetcher: (page: number) => Promise<Paginated<T>>,
  deps: React.DependencyList = [],
  initialPage = 1,
): PagedState<T> {
  const [page, setPage] = React.useState(initialPage)

  // Any filter change must return to page 1: staying on page 5 of a new,
  // shorter result set shows an empty table and looks like a failure.
  React.useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const query = useApiQuery(() => fetcher(page), [...deps, page])

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? page,
    pageSize: query.data?.pageSize ?? 25,
    totalPages: query.data?.totalPages ?? 0,
    loading: query.loading,
    error: query.error,
    setPage,
    refetch: query.refetch,
  }
}

/**
 * Wraps a mutation with pending state and success/error toasts.
 *
 * Returning the result rather than swallowing it lets a caller chain on it, and
 * rethrowing keeps a failure visible to the form that triggered it instead of
 * appearing to succeed.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  mutate: (...args: TArgs) => Promise<TResult>,
  options: {
    onSuccess?: (result: TResult) => void
    successMessage?: string | ((result: TResult) => string)
    errorMessage?: string
  } = {},
) {
  const [pending, setPending] = React.useState(false)

  const run = React.useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      setPending(true)
      try {
        const result = await mutate(...args)

        if (options.successMessage) {
          const message =
            typeof options.successMessage === "function"
              ? options.successMessage(result)
              : options.successMessage
          toast.success(message)
        }
        options.onSuccess?.(result)
        return result
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : (options.errorMessage ?? "The action could not be completed")
        toast.error(message)
        return undefined
      } finally {
        setPending(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate],
  )

  return { run, pending }
}

/**
 * Debounces a value, for search inputs.
 *
 * Without this every keystroke issues a request, which both hammers the API and
 * produces out-of-order responses that can render stale results.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = React.useState(value)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
