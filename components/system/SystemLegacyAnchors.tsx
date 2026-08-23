export function SystemLegacyAnchors({ ids }: { ids?: readonly string[] }) {
  if (!ids?.length) return null;

  return (
    <>
      {ids.map((id) => (
        <span key={id} id={id} className="method-anchor-alias" aria-hidden="true" />
      ))}
    </>
  );
}
