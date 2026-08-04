type EditorialHueFieldProps = {
  className?: string;
  decorated?: boolean;
  tone?: "default" | "method" | "about";
};

export function EditorialHueField({
  className,
  decorated = true,
  tone = "default",
}: EditorialHueFieldProps) {
  const classes = [
    "editorial-hue-field",
    `editorial-hue-field--${tone}`,
    !decorated && "editorial-hue-field--clean",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} aria-hidden="true">
      {decorated && (
        <>
          <span />
          <span />
          <span />
        </>
      )}
    </div>
  );
}
