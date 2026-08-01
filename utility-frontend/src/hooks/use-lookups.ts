/**
 * Live option lists for the admin forms.
 *
 * Several master screens reference other masters by id: a service needs a real
 * category id, a commission slab needs a real user-type id. Hardcoding those
 * lists would produce ids that do not exist in the database, so every create
 * would be rejected — and the failure would look like a server fault rather than
 * stale frontend data. These hooks read the same endpoints the pages write to.
 */

import { api } from "@/lib/api"
import { useApiQuery } from "./use-api"

/** Enough to cover every realistic master list without paging in a picker. */
const OPTION_PAGE_SIZE = 200

export interface LookupOption {
  id: string
  name: string
}

export interface LookupState<T extends LookupOption = LookupOption> {
  options: T[]
  loading: boolean
  /** True once loading has finished and the list is genuinely empty. */
  empty: boolean
}

function useLookup(resource: "service-categories" | "user-types" | "commission-plans"): LookupState {
  const query = useApiQuery(
    () => api.admin.master<LookupOption>(resource).list({ pageSize: OPTION_PAGE_SIZE, status: "active" }),
    [resource],
    // A picker failing to load is already visible as an empty list with a hint;
    // a toast per picker would stack up on a page that has three of them.
    { showErrorToast: false },
  )

  const options = query.data?.items ?? []
  return { options, loading: query.loading, empty: !query.loading && options.length === 0 }
}

/** Service categories, for the service master. */
export function useCategoryOptions(): LookupState {
  return useLookup("service-categories")
}

/** User types, for commission plans and slabs. */
export function useUserTypeOptions(): LookupState {
  return useLookup("user-types")
}

/** Commission plans, for grouping slabs. */
export function usePlanOptions(): LookupState {
  return useLookup("commission-plans")
}

export interface ServiceOption extends LookupOption {
  category: string
}

/**
 * Services, for the commission-slab picker.
 *
 * Slabs are matched by service *name* at transaction time, so the picker must
 * offer the exact stored names. A free-text field here would let a typo create a
 * slab that silently never pays out.
 */
export function useServiceOptions(): LookupState<ServiceOption> {
  const query = useApiQuery(
    () => api.admin.master<ServiceOption>("services").list({ pageSize: OPTION_PAGE_SIZE, status: "active" }),
    [],
    { showErrorToast: false },
  )

  const options = query.data?.items ?? []
  return { options, loading: query.loading, empty: !query.loading && options.length === 0 }
}
