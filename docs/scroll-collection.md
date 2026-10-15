# Scroll collection

Landing-page cards begin gathering as their bottom edge reaches the upper third of the reading area, then leave upward together. Scroll back to spread them into their original layout.

`ScrollCollection` keeps each item's layout slot in place and transforms a separate visual wrapper. A shared animation frame reads geometry before painting; resize, fonts, and image loads refresh cached measurements. Normal-motion layouts reserve a short exit area so the finished stack remains visible before departure.

The hero, services, About, process steps, reasons, pricing, portfolio, and FAQ use this effect. The quotation form stays outside collection groups. Existing section IDs and landing navigation remain intact.

Server-rendered content is visible. Reduced-motion preferences disable collection immediately. Keyboard focus restores the full group and brings the focused control into view. Miniature cards ignore pointer clicks until restored.

Local verification scripts use isolated headless Edge profiles against a production server on port 3100:

- `node scripts/check-collection.mjs` — gathering, upward departure, reverse scroll, stable layout, focus, reduced motion, and overflow.
- `node scripts/check-responsive.mjs` — eight routes at 17 widths from 320px to 7680px.
- `node scripts/check-motion.mjs` — existing page transitions and interactive motion.
- `node scripts/check-landing.mjs` — section navigation, detail links, and a locally intercepted quote-form submission.
