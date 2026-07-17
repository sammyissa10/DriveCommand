# Finance lib

Shared finance helpers for the carrier portal (invoicing, route costing).

## `us-state-sales-tax.ts` — invoice tax-rate convenience table

A hand-maintained table of **statewide base sales-tax rates** used to auto-fill the
Tax (%) field on the invoice forms when a carrier picks a state. It is a
**convenience helper, not a compliance tool.**

### How it's used
- Invoice forms ([`invoice-form.tsx`](../../components/invoices/invoice-form.tsx),
  [`InvoiceFormMobile.tsx`](../../components/invoices/InvoiceFormMobile.tsx)) show a
  "Tax state" dropdown next to Tax (%).
- Default selection is **Exempt / none (0%)**. Tax is only applied when the carrier
  explicitly picks a state — nothing is auto-stamped onto exempt freight.
- The picked state is **not persisted**; it only drives the tax % → amount that is
  stored on the invoice.

### Known limitations (by design)
- **Freight is generally tax-exempt.** Interstate transportation isn't sales-taxable;
  these rates apply to taxable goods/services, not the linehaul. Only used when an
  invoice genuinely has taxable charges.
- **Statewide base only.** County / city / special-district local taxes are excluded,
  so the true combined rate is often higher.
- **No sourcing logic.** For a multi-stop interstate load there is no single "correct"
  state — the carrier chooses.
- **Rates drift.** See the `TODO(tax-rates)` in the file: review each **Jan 1 and
  Jul 1**. Last reviewed 2026-07-17; next review due **2027-01-01**.

### When to replace this
If taxable invoice volume grows enough to need real, jurisdiction-accurate tax, drop
this table in favor of a tax API (**Avalara** or **TaxJar**) that resolves
state + county + city + district and taxability rules. This table is intentionally the
lightweight, zero-cost option for the common case where tax is rare or zero.
