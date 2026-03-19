'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';

interface InvoiceItem {
  description: string;
  quantity: string;
  unitPrice: string;
}

interface InvoiceItemsEditorProps {
  initialItems?: Array<{
    description: string;
    quantity: any;
    unitPrice: any;
    amount?: any;
  }>;
  onSubtotalChange?: (subtotal: number) => void;
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

function emptyItem(): InvoiceItem {
  return { description: '', quantity: '', unitPrice: '' };
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

export function InvoiceItemsEditor({ initialItems, onSubtotalChange }: InvoiceItemsEditorProps) {
  const [items, setItems] = useState<InvoiceItem[]>(
    initialItems && initialItems.length > 0
      ? initialItems.map((item) => ({
          description: item.description,
          quantity: String(Number(item.quantity)),
          unitPrice: String(Number(item.unitPrice)),
        }))
      : [emptyItem()]
  );

  const getItemAmount = (item: InvoiceItem): number => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    return qty * price;
  };

  const subtotal = items.reduce((sum, item) => sum + getItemAmount(item), 0);

  useEffect(() => {
    onSubtotalChange?.(subtotal);
  }, [subtotal, onSubtotalChange]);

  const updateItem = (index: number, field: keyof InvoiceItem, value: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
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

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Serialize to JSON for form submission
  const itemsJson = JSON.stringify(
    items.map((item) => ({
      description: item.description,
      quantity: parseFloat(item.quantity) || 0,
      unitPrice: parseFloat(item.unitPrice) || 0,
    }))
  );

  return (
    <div className="space-y-3">
      <input type="hidden" name="itemsJson" value={itemsJson} />

      {/* Header row */}
      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
        <div className="col-span-5">Description</div>
        <div className="col-span-2 text-right">Qty</div>
        <div className="col-span-2 text-right">Unit Price</div>
        <div className="col-span-2 text-right">Amount</div>
        <div className="col-span-1" />
      </div>

      {/* Item rows */}
      {items.map((item, index) => {
        const amount = getItemAmount(item);
        return (
          <div key={index} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-5">
              <DescriptionCombo
                value={item.description}
                onChange={(description) => handleDescriptionChange(index, description)}
              />
            </div>
            <div className="col-span-2">
              <input
                type="number"
                placeholder="1"
                step="0.01"
                min="0.01"
                value={item.quantity}
                onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                className={inputClass}
                required
              />
            </div>
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
            <div className="col-span-2 text-right text-sm font-medium py-2 px-1">
              ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
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
        );
      })}

      {/* Add item button */}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors px-1"
      >
        <Plus className="h-4 w-4" />
        Add Line Item
      </button>

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
