import { HelixIdentity } from "@/components/brand/HelixIdentity";

export function AdminHelixIdentity({
  className,
  compact = false,
  title,
}: {
  className: string;
  compact?: boolean;
  title?: string;
}) {
  return (
    <div
      className={className}
      role="img"
      aria-label="helix Admin"
      title={title}
    >
      <HelixIdentity
        variant={compact ? "symbol" : "wordmark"}
        decorative
      />
      {compact ? null : <span aria-hidden="true">ADMIN</span>}
    </div>
  );
}
