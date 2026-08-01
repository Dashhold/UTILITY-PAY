import * as React from "react"
import {
  type ColumnDef, type SortingState, flexRender, getCoreRowModel,
  getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { EmptyState } from "@/components/shared/empty-state"
import { TableSkeleton } from "@/components/shared/table-skeleton"
import { cn } from "@/lib/utils"

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[]
  data: TData[]
  /** Enables the built-in client-side search box. */
  searchKey?: string
  searchPlaceholder?: string
  loading?: boolean
  filters?: React.ReactNode
  onExport?: () => void
  emptyTitle?: string
  emptyDescription?: string
  toolbarRight?: React.ReactNode

  /**
   * Controlled search value. Supplying this with onSearchChange switches the
   * search box to server-side mode.
   *
   * Client-side filtering must be disabled in that mode: the server has already
   * filtered, and filtering the returned page again would hide rows that matched
   * on a column this table does not render.
   */
  searchValue?: string
  onSearchChange?: (value: string) => void

  /** Server-side pagination. When set, the internal pagination is bypassed. */
  serverPagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    onPageChange: (page: number) => void
  }
}

export function DataTable<TData>({
  columns, data, searchKey, searchPlaceholder = "Search...", loading,
  filters, onExport, emptyTitle = "No records found", emptyDescription, toolbarRight,
  searchValue, onSearchChange, serverPagination,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState("")

  const serverSearch = onSearchChange !== undefined
  const showSearch = searchKey !== undefined || serverSearch

  const table = useReactTable({
    data,
    columns,
    // In server-search mode the global filter is left empty so the row model is
    // not narrowed a second time.
    state: { sorting, globalFilter: serverSearch ? "" : globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // A server-paginated table receives exactly one page, so the client must not
    // slice it further.
    initialState: { pagination: { pageSize: serverPagination ? 1000 : 10 } },
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {showSearch && (
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder={searchPlaceholder}
                value={serverSearch ? (searchValue ?? "") : globalFilter}
                onChange={(e) =>
                  serverSearch ? onSearchChange?.(e.target.value) : setGlobalFilter(e.target.value)
                }
                className="h-9 pl-8"
              />
            </div>
          )}
          {filters}
        </div>
        <div className="flex items-center gap-2">
          {toolbarRight}
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="size-3.5" /> Export
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <TableSkeleton columns={columns.length} />
        ) : data.length === 0 ? (
          <div className="p-2">
            <EmptyState title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          className="flex items-center gap-1 hover:text-gray-700"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ArrowUpDown className="size-3" />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Server-paginated footer. The counts come from the server, because the
          client only holds the current page and cannot know the total. */}
      {!loading && serverPagination && data.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <span className="text-xs text-gray-500">
            Showing{" "}
            <span className="font-medium text-gray-900">
              {(serverPagination.page - 1) * serverPagination.pageSize + 1}
            </span>{" "}
            to{" "}
            <span className="font-medium text-gray-900">
              {Math.min(serverPagination.page * serverPagination.pageSize, serverPagination.total)}
            </span>{" "}
            of <span className="font-medium text-gray-900">{serverPagination.total}</span> results
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={serverPagination.page <= 1}
              onClick={() => serverPagination.onPageChange(serverPagination.page - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-gray-500">
              Page {serverPagination.page} of {Math.max(serverPagination.totalPages, 1)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={serverPagination.page >= serverPagination.totalPages}
              onClick={() => serverPagination.onPageChange(serverPagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {!loading && !serverPagination && data.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>
              Showing{" "}
              <span className="font-medium text-gray-900">
                {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-medium text-gray-900">
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length
                )}
              </span>{" "}
              of <span className="font-medium text-gray-900">{table.getFilteredRowModel().rows.length}</span> results
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="icon" className="size-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="table-num px-2 text-xs font-medium text-gray-600">
                {table.getState().pagination.pageIndex + 1} / {Math.max(table.getPageCount(), 1)}
              </span>
              <Button
                variant="outline" size="icon" className="size-8"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function SortableHeader({ children }: { children: React.ReactNode }) {
  return <span className={cn("text-xs")}>{children}</span>
}
