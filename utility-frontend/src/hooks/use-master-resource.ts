/**
 * CRUD binding for the admin master-data resources.
 *
 * The admin panel manages a dozen structurally identical resources. This hook
 * pairs with the backend's generic master endpoints so each page supplies only
 * its columns and its form, rather than repeating list/create/update/delete
 * plumbing twelve times — which is twelve chances to get a refetch or an error
 * path subtly wrong.
 */

import * as React from "react"
import { toast } from "sonner"
import { api, ApiError, type AdminMasterResource, type ListParams } from "@/lib/api"
import { useApiList, useDebounced } from "./use-api"

export interface MasterResourceState<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  loading: boolean
  error: string | null

  search: string
  setSearch: (value: string) => void
  statusFilter: string
  setStatusFilter: (value: string) => void
  setPage: (page: number) => void

  /** True while a create, update or delete is in flight. */
  saving: boolean

  create: (payload: Partial<T>) => Promise<T | undefined>
  update: (id: string, payload: Record<string, unknown>) => Promise<T | undefined>
  remove: (id: string) => Promise<boolean>
  refetch: () => void
}

export function useMasterResource<T extends { id: string }>(
  resource: AdminMasterResource,
  options: { label?: string; pageSize?: number } = {},
): MasterResourceState<T> {
  const label = options.label ?? "Record"
  const pageSize = options.pageSize ?? 25

  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [saving, setSaving] = React.useState(false)

  // Debounced so typing does not fire a request per keystroke.
  const debouncedSearch = useDebounced(search)

  const client = React.useMemo(() => api.admin.master<T>(resource), [resource])

  const list = useApiList<T>(
    (page) => {
      const params: ListParams = { page, pageSize }
      if (debouncedSearch.trim() !== "") params.search = debouncedSearch.trim()
      if (statusFilter !== "all") params.status = statusFilter
      return client.list(params)
    },
    [resource, debouncedSearch, statusFilter, pageSize],
  )

  /**
   * Runs a mutation, then refetches.
   *
   * Refetching rather than patching local state matters here: the server may
   * derive fields the client cannot (counts, defaults, normalised values), so a
   * local patch would drift from the truth.
   */
  const runMutation = React.useCallback(
    async <R,>(action: () => Promise<R>, successMessage: string): Promise<R | undefined> => {
      setSaving(true)
      try {
        const result = await action()
        toast.success(successMessage)
        list.refetch()
        return result
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : `Could not save ${label.toLowerCase()}`)
        return undefined
      } finally {
        setSaving(false)
      }
    },
    // list.refetch is stable via useCallback in useApiQuery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [label, list.refetch],
  )

  const create = React.useCallback(
    (payload: Partial<T>) => runMutation(() => client.create(payload), `${label} created`),
    [client, label, runMutation],
  )

  const update = React.useCallback(
    (id: string, payload: Record<string, unknown>) =>
      runMutation(() => client.update(id, payload), `${label} updated`),
    [client, label, runMutation],
  )

  const remove = React.useCallback(
    async (id: string) => {
      const result = await runMutation(async () => {
        await client.remove(id)
        return true
      }, `${label} deleted`)
      return result === true
    },
    [client, label, runMutation],
  )

  return {
    items: list.items,
    total: list.total,
    page: list.page,
    pageSize: list.pageSize,
    totalPages: list.totalPages,
    loading: list.loading,
    error: list.error,

    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    setPage: list.setPage,

    saving,
    create,
    update,
    remove,
    refetch: list.refetch,
  }
}
