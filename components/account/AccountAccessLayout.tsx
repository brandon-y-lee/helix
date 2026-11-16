import Image from "next/image";
import type { ReactNode } from "react";

export function AccountAccessLayout({
  children,
  heading,
  keepHeadingOnOneLine = false,
}: {
  children: ReactNode;
  heading: string;
  keepHeadingOnOneLine?: boolean;
}) {
  return (
    <div className="storefront-shell account-access-shell">
      <div className="account-access-layout">
        <section className="account-access-layout__form-panel">
          <div className="account-access-layout__form">
            <h1
              className={
                keepHeadingOnOneLine
                  ? "account-access-layout__heading--single-line"
                  : undefined
              }
            >
              {heading}
            </h1>
            {children}
          </div>
        </section>
        <div className="account-access-layout__visual" aria-hidden="true">
          <Image
            src="/media/account/access-hero.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 820px) 1px, 50vw"
            className="account-access-layout__image"
          />
          <p>Your skin. Your system.</p>
        </div>
      </div>
    </div>
  );
}
