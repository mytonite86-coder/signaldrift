# SignalDrift build checklist

## Completed — v0.1 foundation

- [x] Define the smallest attribution-first vertical slice
- [x] Seed PathSeal as the proving product
- [x] Campaign link generator
- [x] Source/medium/campaign UTM tagging
- [x] Manual event recorder for pipeline testing
- [x] Attribution metrics and source comparison
- [x] Conversion-path display
- [x] CSV export
- [x] Responsive desktop/mobile shell
- [x] Persistent browser data
- [x] Unit tests and production build check

## Next — Automation 0.1 live wiring

- [x] Add authenticated event-ingestion API
- [x] Store events in an isolated database on the shared MongoDB Atlas cluster
- [ ] Capture UTM values when PathSeal loads
- [ ] Carry attribution through signup and checkout
- [ ] Record Stripe subscription conversion from webhook
- [ ] Add privacy/consent language and retention rules

## Later — only after 0.1 works

- [ ] Automation 0.2: signup welcome email
- [ ] Automation 0.3: upload/no-subscription follow-up after two days
- [ ] Product intake and reusable campaign asset generation
- [x] Path Seal Campaign 01 draft review and tracking-link approval proof
- [ ] Approval-based delivery controls beyond tracking activation
- [ ] Cross-product learning loop
