'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import {
  INVOICE_ITEM_TYPES,
  INVOICE_ITEM_UNITS,
  ITEM_TYPE_LABELS,
  ITEM_UNIT_LABELS,
  type InvoiceItemType,
  type InvoiceItemUnit,
} from '@drivecommand/validation';

// Logic ported verbatim from invoice-items-editor.tsx; only the render is
// restyled into mobile-ds cards. Same math, same itemsJson submission.

interface InvoiceItem {
  description: string;
  quantity: string;
  unitPrice: string;
  itemType: InvoiceItemType;
  unitType: InvoiceItemUnit;
}

interface InvoiceItemsEditorMobileProps {
  initialItems?: Array<{
    description: string;
    quantity: unknown;
    unitPrice: unknown;
    amount?: unknown;
    itemType?: string;
    unitType?: string;
  }>;
  onSubtotalChange?: (subtotal: number) => void;
  loadedMiles?: number;
}

const PREDEFINED_LINE_ITEMS: string[] = [
  'Freight Charges',
  'Fuel Surcharge',
  'Detention',
  'Layover',
  'Lumper Fee',
  'TONU (Truck Ordered Not Used)',
  'Accessorial Charges',
  'Stop-Off Charge',
  'Deadhead Miles',
  'Hazmat Fee',
];

const dsInput =
  'h-11 w-full rounded-[10px] bg-ds-input px-3 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3';
const dsSelect = 'h-11 w-full rounded-[10px] bg-ds-input px-2 text-[15px] text-ds-txt outline-none';

function emptyItem(): InvoiceItem {
  return { description: '', quantity: '1', unitPrice: '', itemType: 'OTHER', unitType: 'FLAT' };
}

function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DescriptionCombo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredItems =
    value.trim() === ''
      ? PREDEFINED_LINE_ITEMS
      : PREDEFINED_LINE_ITEMS.filter((label) => label.toLowerCase().includes(value.toLowerCase()));

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        placeholder="Description"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => value === '' && setOpen(true)}
        className={`${dsInput} pr-9`}
        autoComplete="off"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setOpen((p) => !p)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-ds-txt3"
        aria-label="Show predefined items"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-[12px] bg-ds-elevated p-1 shadow-lg">
          {filteredItems.length === 0 ? (
            <div className="px-3 py-2 text-[13px] text-ds-txt3">No matches — type to use custom</div>
          ) : (
            filteredItems.map((label) => (
              <button
                key={label}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(label);
                  setOpen(false);
                }}
                className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-[15px] text-ds-txt transition active:opacity-75"
              >
                {label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function InvoiceItemsEditorMobile({
  initialItems,
  onSubtotalChange,
  loadedMiles = 0,
}: InvoiceItemsEditorMobileProps) {
  const [items, setItems] = useState<InvoiceItem[]>(
    initialItems && initialItems.length > 0
      ? initialItems.map((item) => ({
          description: item.description,
          quantity: String(Number(item.quantity)),
          unitPrice: String(Number(item.unitPrice)),
          itemType: (item.itemType as InvoiceItemType) || 'OTHER',
          unitType: (item.unitType as InvoiceItemUnit) || 'FLAT',
        }))
      : [emptyItem()],
  );

  const getItemAmount = (item: InvoiceItem): number => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    if (item.unitType === 'PERCENT') return (qty / 100) * price;
    return qty * price;
  };

  const subtotal = items.reduce((sum, item) => sum + getItemAmount(item), 0);

  useEffect(() => {
    onSubtotalChange?.(subtotal);
  }, [subtotal, onSubtotalChange]);

  const linehaulAmount = items.reduce((found, item) => {
    if (found !== null) return found;
    if (item.itemType === 'LINEHAUL') return parseFloat(item.unitPrice) || 0;
    return null;
  }, null as number | null);

  const updateItem = (index: number, field: keyof InvoiceItem, value: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const updateItemType = (index: number, itemType: InvoiceItemType) => {
    setItems((prev) => {
      const updated = [...prev];
      const current = { ...updated[index], itemType };
      if (itemType === 'FUEL_SURCHARGE') {
        current.unitType = 'PERCENT';
        const lhAmount = prev.find((it) => it.itemType === 'LINEHAUL');
        if (lhAmount) current.unitPrice = String(parseFloat(lhAmount.unitPrice) || 0);
        else if (linehaulAmount !== null) current.unitPrice = String(linehaulAmount);
      } else if (itemType === 'DETENTION') {
        current.unitType = 'PER_HOUR';
      }
      updated[index] = current;
      return updated;
    });
  };

  const updateUnitType = (index: number, unitType: InvoiceItemUnit) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], unitType };
      return updated;
    });
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const addTypedItem = (itemType: InvoiceItemType) => {
    const defaults: Record<string, Partial<InvoiceItem>> = {
      LINEHAUL: { description: 'Linehaul', unitType: 'FLAT' },
      FUEL_SURCHARGE: {
        description: 'Fuel Surcharge',
        unitType: 'PERCENT',
        unitPrice: linehaulAmount !== null ? String(linehaulAmount) : '',
      },
      DETENTION: { description: 'Detention', unitType: 'PER_HOUR' },
      STOP_OFF: { description: 'Stop-Off', unitType: 'FLAT' },
    };
    const preset = defaults[itemType] || {};
    setItems((prev) => [...prev, { ...emptyItem(), itemType, ...preset }]);
  };

  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  const itemsJson = JSON.stringify(
    items.map((item) => ({
      description: item.description,
      quantity: parseFloat(item.quantity) || 0,
      unitPrice: parseFloat(item.unitPrice) || 0,
      itemType: item.itemType,
      unitType: item.unitType,
    })),
  );

  return (
    <div className="space-y-3">
      <input type="hidden" name="itemsJson" value={itemsJson} />

      {items.map((item, index) => {
        const amount = getItemAmount(item);
        const isFSC = item.itemType === 'FUEL_SURCHARGE';
        const isPerMile = item.itemType === 'LINEHAUL' && item.unitType === 'PER_MILE';
        const fscPercent = parseFloat(item.quantity) || 0;
        const fscBase = parseFloat(item.unitPrice) || 0;
        const fscAmount = (fscPercent / 100) * fscBase;
        return (
          <div key={index} className="space-y-2.5 rounded-[16px] bg-ds-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[0.6px] text-ds-txt3">
                Item {index + 1}
              </span>
              {items.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  aria-label={`Remove item ${index + 1}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-ds-txt3 transition active:opacity-75"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <DescriptionCombo value={item.description} onChange={(d) => updateItem(index, 'description', d)} />

            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Item type"
                value={item.itemType}
                onChange={(e) => updateItemType(index, e.target.value as InvoiceItemType)}
                className={dsSelect}
              >
                {INVOICE_ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ITEM_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <select
                aria-label="Unit"
                value={item.unitType}
                onChange={(e) => updateUnitType(index, e.target.value as InvoiceItemUnit)}
                className={dsSelect}
              >
                {INVOICE_ITEM_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {ITEM_UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                aria-label="Quantity"
                placeholder="Qty"
                step={item.unitType === 'PERCENT' ? '0.01' : '1'}
                min="0"
                value={item.quantity}
                onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                className={dsInput}
              />
              <input
                type="number"
                aria-label="Unit price"
                placeholder="0.00"
                step="0.01"
                min="0"
                value={item.unitPrice}
                onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                className={dsInput}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[12px] text-ds-txt3">
                {isFSC && fscPercent > 0 && fscBase > 0
                  ? `${fscPercent}% of $${money(fscBase)}`
                  : isPerMile && loadedMiles > 0 && parseFloat(item.unitPrice) > 0
                    ? `${loadedMiles.toLocaleString()} mi @ $${parseFloat(item.unitPrice).toFixed(4)}/mi`
                    : ''}
              </span>
              <span className="text-[15px] font-semibold text-ds-txt tabular-nums">
                ${isFSC ? money(fscAmount) : money(amount)}
              </span>
            </div>
          </div>
        );
      })}

      {/* Add + quick-add */}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1.5 px-1 text-[15px] font-medium text-ds-accent transition active:opacity-75"
      >
        <Plus className="h-4 w-4" />
        Add line item
      </button>
      <div className="flex flex-wrap gap-2">
        {(['LINEHAUL', 'FUEL_SURCHARGE', 'DETENTION', 'STOP_OFF'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => addTypedItem(type)}
            className="rounded-full bg-ds-card px-3 py-1.5 text-[12px] font-medium text-ds-txt2 transition active:opacity-75"
          >
            + {ITEM_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="flex justify-end border-t border-ds-hairline pt-3 text-[13px] text-ds-txt2">
        Subtotal:{' '}
        <span className="ml-1.5 font-semibold text-ds-txt tabular-nums">${money(subtotal)}</span>
      </div>
    </div>
  );
}
