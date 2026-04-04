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

interface InvoiceItem {
  description: string;
  quantity: string;
  unitPrice: string;
  itemType: InvoiceItemType;
  unitType: InvoiceItemUnit;
}

interface InvoiceItemsEditorProps {
  initialItems?: Array<{
    description: string;
    quantity: any;
    unitPrice: any;
    amount?: any;
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

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const selectClass =
  'w-full rounded-lg border border-input bg-background px-2 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

function emptyItem(): InvoiceItem {
  return {
    description: '',
    quantity: '1',
    unitPrice: '',
    itemType: 'OTHER',
    unitType: 'FLAT',
  };
}

interface DescriptionComboProps {
  value: string;
  onChange: (description: string) => void;
}

function DescriptionCombo({ value, onChange }: DescriptionComboProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredItems =
    value.trim() === ''
      ? PREDEFINED_LINE_ITEMS
      : PREDEFINED_LINE_ITEMS.filter((label) =>
          label.toLowerCase().includes(value.toLowerCase())
        );

  // Close dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  function handleSelect(label: string) {
    onChange(label);
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
    setOpen(true);
  }

  function handleFocus() {
    if (value === '') {
      setOpen(true);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        placeholder="Description"
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        className={`${inputClass} pr-8`}
        required
        autoComplete="off"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setOpen((prev) => !prev)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Show predefined items"
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-md z-10">
          {filteredItems.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No matches — type to use custom</div>
          ) : (
            filteredItems.map((label) => (
              <button
                key={label}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(label);
                }}
                className="flex w-full items-center px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {label}
              </button>
            ))
          )}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen(false);
            }}
            className="flex w-full items-center px-3 py-2 text-sm cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors border-t border-border"
          >
            Custom entry — type freely
          </button>
        </div>
      )}
    </div>
  );
}

export function InvoiceItemsEditor({ initialItems, onSubtotalChange, loadedMiles = 0 }: InvoiceItemsEditorProps) {
  const [items, setItems] = useState<InvoiceItem[]>(
    initialItems && initialItems.length > 0
      ? initialItems.map((item) => ({
          description: item.description,
          quantity: String(Number(item.quantity)),
          unitPrice: String(Number(item.unitPrice)),
          itemType: (item.itemType as InvoiceItemType) || 'OTHER',
          unitType: (item.unitType as InvoiceItemUnit) || 'FLAT',
        }))
      : [emptyItem()]
  );

  const getItemAmount = (item: InvoiceItem): number => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    if (item.unitType === 'PERCENT') {
      return (qty / 100) * price;
    }
    return qty * price;
  };

  const subtotal = items.reduce((sum, item) => sum + getItemAmount(item), 0);

  useEffect(() => {
    onSubtotalChange?.(subtotal);
  }, [subtotal, onSubtotalChange]);

  // Get the linehaul amount for FSC auto-fill
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
      // Auto-set unitType for FSC
      if (itemType === 'FUEL_SURCHARGE') {
        current.unitType = 'PERCENT';
        // Auto-fill unitPrice from linehaul amount
        const lhAmount = prev.find((it) => it.itemType === 'LINEHAUL');
        if (lhAmount) {
          current.unitPrice = String(parseFloat(lhAmount.unitPrice) || 0);
        } else if (linehaulAmount !== null) {
          current.unitPrice = String(linehaulAmount);
        }
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

  const handleDescriptionChange = (index: number, description: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], description };
      return updated;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, emptyItem()]);
  };

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
    setItems((prev) => [
      ...prev,
      { ...emptyItem(), itemType, ...preset },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Serialize to JSON for form submission
  const itemsJson = JSON.stringify(
    items.map((item) => ({
      description: item.description,
      quantity: parseFloat(item.quantity) || 0,
      unitPrice: parseFloat(item.unitPrice) || 0,
      itemType: item.itemType,
      unitType: item.unitType,
    }))
  );

  return (
    <div className="space-y-3">
      <input type="hidden" name="itemsJson" value={itemsJson} />

      {/* Header row */}
      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
        <div className="col-span-2">Type</div>
        <div className="col-span-3">Description</div>
        <div className="col-span-1 text-right">Qty</div>
        <div className="col-span-2">Unit</div>
        <div className="col-span-2 text-right">Unit Price</div>
        <div className="col-span-1 text-right">Amount</div>
        <div className="col-span-1" />
      </div>

      {/* Item rows */}
      {items.map((item, index) => {
        const amount = getItemAmount(item);
        const isFSC = item.itemType === 'FUEL_SURCHARGE';
        const isPerMile = item.itemType === 'LINEHAUL' && item.unitType === 'PER_MILE';
        const fscPercent = parseFloat(item.quantity) || 0;
        const fscBase = parseFloat(item.unitPrice) || 0;
        const fscAmount = (fscPercent / 100) * fscBase;
        return (
          <div key={index} className="space-y-1">
            <div className="grid grid-cols-12 gap-2 items-center">
              {/* Type */}
              <div className="col-span-2">
                <select
                  value={item.itemType}
                  onChange={(e) => updateItemType(index, e.target.value as InvoiceItemType)}
                  className={selectClass}
                >
                  {INVOICE_ITEM_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {ITEM_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              {/* Description */}
              <div className="col-span-3">
                <DescriptionCombo
                  value={item.description}
                  onChange={(description) => handleDescriptionChange(index, description)}
                />
              </div>
              {/* Qty */}
              <div className="col-span-1">
                <input
                  type="number"
                  placeholder="1"
                  step={item.unitType === 'PERCENT' ? '0.01' : '1'}
                  min="0"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              {/* Unit */}
              <div className="col-span-2">
                <select
                  value={item.unitType}
                  onChange={(e) => updateUnitType(index, e.target.value as InvoiceItemUnit)}
                  className={selectClass}
                >
                  {INVOICE_ITEM_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {ITEM_UNIT_LABELS[unit]}
                    </option>
                  ))}
                </select>
              </div>
              {/* Unit Price */}
              <div className="col-span-2">
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              {/* Amount */}
              <div className="col-span-1 text-right text-sm font-medium py-2 px-1">
                ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {/* Delete */}
              <div className="col-span-1 flex justify-end">
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {/* Helper text */}
            {isFSC && fscPercent > 0 && fscBase > 0 && (
              <p className="text-xs text-muted-foreground pl-1">
                {fscPercent}% of ${fscBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ={' '}
                ${fscAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
            {isPerMile && loadedMiles > 0 && parseFloat(item.unitPrice) > 0 && (
              <p className="text-xs text-muted-foreground pl-1">
                {loadedMiles.toLocaleString()} mi @ ${parseFloat(item.unitPrice).toFixed(4)}/mi ={' '}
                ${(loadedMiles * (parseFloat(item.unitPrice) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
        );
      })}

      {/* Add item button + quick-add buttons */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors px-1"
        >
          <Plus className="h-4 w-4" />
          Add Line Item
        </button>
        <div className="flex flex-wrap gap-2">
          {(['LINEHAUL', 'FUEL_SURCHARGE', 'DETENTION', 'STOP_OFF'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addTypedItem(type)}
              className="text-xs rounded-md border border-border px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              + {ITEM_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Subtotal */}
      <div className="flex justify-end border-t border-border pt-3">
        <div className="text-sm text-muted-foreground">
          Subtotal:{' '}
          <span className="font-semibold text-foreground">
            ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
}
