import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tiga potongan yang berulang di keenam layar admin. Bukan design system —
 * hanya kelas yang kalau disalin enam kali pasti menyimpang satu sama lain.
 */

export function Panel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-2xl border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  );
}

export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-[260px] flex-1">
        <h1 className="font-serif text-[30px] leading-tight font-semibold tracking-tight">
          {title}
        </h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Avatar({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex size-8 flex-none items-center justify-center rounded-full bg-secondary text-xs font-extrabold text-secondary-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Judul kolom/bagian: huruf kecil, renggang, sangat redup. */
export const EYEBROW =
  "text-[10.5px] font-extrabold tracking-[0.09em] uppercase text-muted-foreground/70";

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

export function Loading() {
  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      Memuat…
    </p>
  );
}
