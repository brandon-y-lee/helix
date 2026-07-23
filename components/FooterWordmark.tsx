import Link from "next/link";

export function FooterWordmark() {
  return (
    <div
      className="site-footer__wordmark-band"
      data-scroll-zoom-mode="view-timeline"
    >
      <div className="site-footer__wordmark">
        <h2 id="site-footer-heading">
          <Link href="/">Mei Pelle</Link>
        </h2>
      </div>
    </div>
  );
}
