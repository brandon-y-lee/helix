# Rhode Footer-Linked Pages Audit

Date: 2026-06-20

Reference pages inspected with Chrome:

- https://www.rhodeskin.com/pages/privacy-policy
- https://www.rhodeskin.com/pages/terms-of-service
- https://www.rhodeskin.com/pages/accessibility-statement
- https://www.rhodeskin.com/pages/faq
- https://www.rhodeskin.com/pages/contact-us
- https://www.rhodeskin.com/pages/cookie-policy
- https://www.rhodeskin.com/pages/do-not-sell-my-personal-information
- https://www.rhodeskin.com/pages/store-locator
- https://www.rhodeskin.com/pages/events

## Page Matrix

| Rhode page | Function | Structure observed | Mei Pelle route | Decision |
| --- | --- | --- | --- | --- |
| Privacy Policy | Long privacy/legal disclosure | Long document, many headings, tables, email links, footer | `/privacy-policy` | Include, but write original copy from Mei Pelle data practices. |
| Terms of Service | Legal terms | Long legal document, sparse headings, third-party/shipping references | `/terms-of-service` | Include, but omit arbitration, shipping, returns, and live-order terms. |
| Accessibility Statement | Accessibility position | Title, short sections, contact section | `/accessibility` | Include with WCAG 2.2 AA target and no certification claims. |
| FAQ | Customer support | Large title, category navigation, product/order/shipping tables | `/faq` | Include, but use current product, System, account, cart, and contact facts. |
| Contact | Support intake | Editorial form, conditional order fields, upload, CAPTCHA | `/contact` | Include, but no order fields, file upload, CAPTCHA, or fake sending. |
| Cookie Policy | Cookie/ad disclosure | Legal text and tables | `/cookie-policy` | Include, but list only actual essential categories and inactive optional categories. |
| Do Not Sell | Privacy choices | Long advertising/opt-out explanation | `/privacy-choices` | Include as truthful current status; no fake opt-out switch. |
| Store Locator | Retail locations | Locator/map/list powered by store-locator service | None | Omit until real retail locations exist. |
| Events | Event landing/RSVP | Event cards, RSVP form, map directions, FAQ | None | Omit until real events exist. |

## Implementation Notes

- Rhode's support pages often assume live orders, shipping, returns, retail, and
  marketing systems. Mei Pelle should not mirror those claims.
- Rhode's contact form asks for order numbers and uploads. Mei Pelle should not
  request unsupported order details, files, payment data, addresses, medical
  records, or government ID.
- Rhode's privacy/cookie pages mention advertising and opt-out ecosystems.
  Mei Pelle should document the current absence of those tools unless they are
  later implemented.

