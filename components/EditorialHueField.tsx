type EditorialHueFieldProps = {
  className?: string;
};

export function EditorialHueField({ className }: EditorialHueFieldProps) {
  return (
    <div
      className={["editorial-hue-field", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
    </div>
  );
}
