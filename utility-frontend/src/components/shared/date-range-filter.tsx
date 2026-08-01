import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * The window a report covers.
 *
 * Both bounds are plain YYYY-MM-DD strings because that is what the backend's
 * queryTime parser accepts and what a date input produces. Undefined means
 * unbounded on that side, which the backend treats as "no filter" rather than
 * as the epoch.
 */
export interface DateRange {
  from?: string
  to?: string
}

export type RangePreset = "all" | "today" | "week" | "month" | "quarter" | "fy" | "custom"

const PRESET_LABELS: Record<Exclude<RangePreset, "custom">, string> = {
  all: "All time",
  today: "Today",
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  fy: "This financial year",
}

function isoDate(d: Date): string {
  // Built from local parts, not toISOString, so a user just after midnight in
  // IST does not get yesterday's date from the UTC conversion.
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${month}-${day}`
}

/** Resolves a preset into concrete bounds. */
export function resolvePreset(preset: RangePreset): DateRange {
  const now = new Date()
  const today = isoDate(now)

  switch (preset) {
    case "all":
    case "custom":
      return {}
    case "today":
      return { from: today, to: today }
    case "week": {
      // Weeks start Monday, which is how Indian business reporting reads.
      const start = new Date(now)
      const offset = (start.getDay() + 6) % 7
      start.setDate(start.getDate() - offset)
      return { from: isoDate(start), to: today }
    }
    case "month":
      return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
    case "quarter": {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
      return { from: isoDate(new Date(now.getFullYear(), quarterStartMonth, 1)), to: today }
    }
    case "fy": {
      // The Indian financial year runs April to March, so January through March
      // belongs to the year that started the previous April.
      const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear()
      return { from: isoDate(new Date(year, 3, 1)), to: today }
    }
  }
}

interface DateRangeFilterProps {
  value: DateRange
  onChange: (range: DateRange) => void
  /** Which presets to offer. Defaults to all of them. */
  presets?: Exclude<RangePreset, "custom">[]
  className?: string
}

/**
 * Preset-plus-custom date range picker.
 *
 * The preset is local state while the resolved bounds are lifted, so a page only
 * ever deals with concrete from/to values and does not have to re-derive
 * "this quarter" itself.
 */
export function DateRangeFilter({
  value,
  onChange,
  presets = ["all", "today", "week", "month", "quarter", "fy"],
  className,
}: DateRangeFilterProps) {
  const [preset, setPreset] = React.useState<RangePreset>("all")

  function selectPreset(next: string) {
    const chosen = next as RangePreset
    setPreset(chosen)
    if (chosen !== "custom") onChange(resolvePreset(chosen))
  }

  return (
    <div className={className ?? "flex flex-wrap items-end gap-2"}>
      <Select value={preset} onValueChange={selectPreset}>
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="Date range" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p} value={p}>{PRESET_LABELS[p]}</SelectItem>
          ))}
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>

      {preset === "custom" && (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="range-from" className="text-[11px] text-gray-500">From</Label>
            <Input
              id="range-from"
              type="date"
              className="h-9 w-36"
              value={value.from ?? ""}
              max={value.to}
              onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="range-to" className="text-[11px] text-gray-500">To</Label>
            <Input
              id="range-to"
              type="date"
              className="h-9 w-36"
              value={value.to ?? ""}
              min={value.from}
              onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
            />
          </div>
        </>
      )}
    </div>
  )
}
