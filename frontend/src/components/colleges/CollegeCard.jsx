import React from "react";
import { Card } from "@/components/ui/card";
import { PencilSimple, Trash, Buildings, User } from "@phosphor-icons/react";

const COLLAPSED_COUNT = 6;

/** Single college row in the catalogue grid. Renders name/place/deal-with header
 * + capped course chips (collapses past 6 with a "+ N more" toggle).
 */
export default function CollegeCard({ c, onEdit, onDelete }) {
  const courses = c.courses || [];
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? courses : courses.slice(0, COLLAPSED_COUNT);
  const hidden = Math.max(0, courses.length - visible.length);

  return (
    <Card
      className="p-5 border border-border bg-card rounded-lg shadow-none hover:border-orange-500/40 transition-colors flex flex-col"
      data-testid={`col-card-${c.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-lg bg-amber-gradient-soft border border-amber-500/30 flex items-center justify-center shrink-0">
            <Buildings size={18} className="text-amber-700 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold truncate" data-testid={`col-name-${c.id}`}>
              {c.name}
            </h3>
            <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {c.place && <span data-testid={`col-place-${c.id}`}>{c.place}</span>}
              {c.deal_with && (
                <>
                  {c.place && <span className="text-muted-foreground/40">·</span>}
                  <span className="flex items-center gap-1" data-testid={`col-dealwith-${c.id}`}>
                    <User size={11} weight="duotone" />
                    {c.deal_with}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onEdit(c)}
            data-testid={`edit-col-${c.id}`}
            className="text-muted-foreground hover:text-foreground p-1.5"
            title="Edit"
          >
            <PencilSimple size={16} />
          </button>
          <button
            onClick={() => onDelete(c)}
            data-testid={`delete-col-${c.id}`}
            className="text-muted-foreground hover:text-rose-700 dark:text-rose-400 p-1.5"
            title="Delete"
          >
            <Trash size={16} />
          </button>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
          Courses · {courses.length}
        </p>
        {courses.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No courses listed</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 items-center">
            {visible.map((course, idx) => (
              <span
                key={`${c.id}-course-${idx}`}
                className="px-2 py-0.5 rounded-full text-[11px] bg-orange-100/60 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/20"
                title={course}
              >
                {course}
              </span>
            ))}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                data-testid={`col-show-more-${c.id}`}
                className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-card border border-border text-muted-foreground hover:border-orange-500/40 hover:text-foreground transition-colors"
              >
                + {hidden} more
              </button>
            )}
            {showAll && courses.length > COLLAPSED_COUNT && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                data-testid={`col-show-less-${c.id}`}
                className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-card border border-border text-muted-foreground hover:border-orange-500/40 hover:text-foreground transition-colors"
              >
                Show less
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
