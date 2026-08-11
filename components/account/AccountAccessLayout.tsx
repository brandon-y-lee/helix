import type { ReactNode } from "react";

export function AccountAccessLayout({
  children,
  heading,
}: {
  children: ReactNode;
  heading: string;
}) {
  return (
    <div className="storefront-shell account-access-shell">
      <div className="account-access-layout">
        <section className="account-access-layout__form-panel">
          <div className="account-access-layout__form">
            <h1>{heading}</h1>
            {children}
          </div>
        </section>
        <div className="account-access-layout__visual" aria-hidden="true">
          <p>Your skin. Your system.</p>
        </div>
      </div>
    </div>
  );
}
