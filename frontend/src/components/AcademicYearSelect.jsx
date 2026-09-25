import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarBlank } from "@phosphor-icons/react";
import { useAcademicYear } from "@/lib/academicYear";

/**
 * Global Academic Year selector shown in the top header. Choosing a year
 * re-scopes every page's data to that calendar year (Jan → Dec); "All years"
 * removes the filter.
 */
export default function AcademicYearSelect() {
  const { year, setYear, years } = useAcademicYear();
  const value = year || "all";

  return (
    <Select value={value} onValueChange={(v) => setYear(v === "all" ? "all" : v)}>
      <SelectTrigger
        data-testid="academic-year-select"
        className="h-9 w-auto min-w-[112px] gap-1.5 rounded-full bg-muted/60 border-transparent px-3 text-xs font-medium hover:bg-muted focus:ring-2 focus:ring-primary/30"
        title="Academic year — scopes the whole app to a calendar year"
      >
        <CalendarBlank size={14} className="text-muted-foreground shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" data-testid="academic-year-all">All years</SelectItem>
        {years.map((y) => (
          <SelectItem key={y} value={String(y)} data-testid={`academic-year-${y}`}>
            {y}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
