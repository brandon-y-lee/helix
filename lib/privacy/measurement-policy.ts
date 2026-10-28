export type MeasurementContext = {
  url: string;
  path: string;
  route: string;
  title: string;
};
const publicRoutes: Record<string, string> = {
  "/": "Home",
  "/collections/shop": "Shop",
  "/system": "System",
  "/about": "About",
  "/faq": "FAQ",
  "/contact": "Contact",
  "/privacy": "Privacy Policy",
  "/terms": "Terms",
  "/cookie-policy": "Cookie Policy",
  "/privacy-choices": "Privacy Choices",
  "/accessibility": "Accessibility",
};
function publicPath(path: string) {
  return (
    Object.hasOwn(publicRoutes, path) ||
    /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)
  );
}
export function measurementContext(
  href: string,
  referrer: string,
  canonical: string,
  allowedOrigin: string,
  verification = false,
): MeasurementContext | null {
  try {
    const url = new URL(href);
    const fixture =
      verification &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.pathname === "/helix-verification/privacy";
    if (
      url.protocol !== "https:" &&
      !(verification && ["127.0.0.1", "localhost"].includes(url.hostname))
    )
      return null;
    if (
      !allowedOrigin ||
      url.origin !== allowedOrigin ||
      url.search ||
      url.hash ||
      (!publicPath(url.pathname) && !fixture)
    )
      return null;
    if (referrer) {
      const previous = new URL(referrer);
      if (
        previous.search ||
        previous.hash ||
        (previous.origin === url.origin
          ? !publicPath(previous.pathname) &&
            !(fixture && previous.pathname === "/helix-verification/privacy")
          : previous.pathname !== "/")
      )
        return null;
    }
    const product = url.pathname.startsWith("/products/");
    if (product && canonical !== `${url.origin}${url.pathname}`) return null;
    return {
      url: `${url.origin}${url.pathname}`,
      path: url.pathname,
      route: product ? "/products/[slug]" : url.pathname,
      title: `Helix — ${product ? "Product" : fixture ? "Privacy verification" : publicRoutes[url.pathname]}`,
    };
  } catch {
    return null;
  }
}
