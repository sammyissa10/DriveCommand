/**
 * React's DOM typings omit `bgcolor` because it is a deprecated presentational
 * attribute. In HTML email it is not optional: Outlook Windows (Word engine)
 * drops `background-color` on table cells in several situations and honours the
 * `bgcolor` attribute instead, which is why every coloured cell in this system
 * carries BOTH.
 *
 * React DOM does render the attribute at runtime — verified in the QA output
 * (`bgcolor="#FFF6E5"` appears on the status cell). Only the type is missing, so
 * this declares it rather than casting at each of the six call sites, where a
 * cast would have to be repeated and could drift.
 *
 * Deliberately narrow: `bgcolor` only, on the three element types that need it.
 * This is not a licence to use presentational attributes in application code —
 * it exists because email clients are twenty years behind the browsers.
 */

import 'react';

declare module 'react' {
  interface TdHTMLAttributes<T> {
    bgcolor?: string;
  }
  interface ThHTMLAttributes<T> {
    bgcolor?: string;
  }
  interface TableHTMLAttributes<T> {
    bgcolor?: string;
  }
}
