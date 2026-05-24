'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { GripVertical, MapPin, Package, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { StopCard } from './StopCard';

export interface StopForEditor {
  id: string;
  sequenceOrder: number;
  stopType: string;
  status: string;
  loadId: string | null;
  loadRefNumber: string | null;
  clientName: string | null;
  facilityName: string;
  facilityCity: string | null;
  facilityState: string | null;
  appointmentStart: string | null;
  appointmentEnd: string | null;
}

interface TripPlanEditorProps {
  tripId: string;
  tripStatus: string;
  stops: StopForEditor[];
}

export function TripPlanEditor({ tripId, tripStatus, stops: initialStops }: TripPlanEditorProps) {
  const [stops, setStops] = useState(initialStops);
  const [saving, setSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const isEditable = tripStatus === 'planned';

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (!isEditable) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDraggedIndex(index);
  }, [isEditable]);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    if (!isEditable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, [isEditable]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, dropIndex: number) => {
    if (!isEditable) return;
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);

    if (dragIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder stops locally
    const newStops = [...stops];
    const [removed] = newStops.splice(dragIndex, 1);
    newStops.splice(dropIndex, 0, removed);

    // Update sequence numbers
    const reorderedStops = newStops.map((stop, idx) => ({
      ...stop,
      sequenceOrder: idx + 1,
    }));

    setStops(reorderedStops);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Save to server
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/carrier/trips/${tripId}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopOrder: reorderedStops.map((s) => s.id) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save order');
      }

      toast.success('Stop order saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save order');
      // Revert to original order
      setStops(initialStops);
    } finally {
      setSaving(false);
    }
  }, [stops, tripId, isEditable, initialStops]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  if (stops.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/25 p-8 text-center">
        <MapPin className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          No stops on this trip yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {saving && (
        <div className="text-sm text-muted-foreground animate-pulse">
          Saving...
        </div>
      )}

      {stops.map((stop, index) => (
        <div
          key={stop.id}
          draggable={isEditable}
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          className={`
            transition-all duration-150
            ${draggedIndex === index ? 'opacity-50' : ''}
            ${dragOverIndex === index && draggedIndex !== index ? 'border-t-2 border-primary' : ''}
          `}
        >
          <StopCard
            stop={stop}
            index={index}
            isEditable={isEditable}
          />
        </div>
      ))}
    </div>
  );
}
