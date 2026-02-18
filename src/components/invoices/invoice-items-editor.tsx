'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';

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

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

function emptyItem(): InvoiceItem {
  return { description: '', quantity: '', unitPrice: '' };
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
              <input
                type="text"
                placeholder="Description"
                value={item.description}
                onChange={(e) => updateItem(index, 'description', e.target.value)}
                className={inputClass}
                required
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
