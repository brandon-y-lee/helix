export function AccountUnavailable({
  retryHref = "/account",
}: {
  retryHref?: string;
}) {
  return (
    <div className="container account-shell">
      <section className="account-panel" role="alert">
        <p className="eyebrow">Account</p>
        <h1>Account temporarily unavailable</h1>
        <p>
          We could not verify your account right now. Your session has not been
          cleared.
        </p>
        <a href={retryHref} className="btn btn--editorial-rounded">
          Try again
        </a>
      </section>
    </div>
  );
}
