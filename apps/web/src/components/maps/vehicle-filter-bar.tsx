'use client';

import { useEffect, useState } from 'react';
import { VehicleLocation } from '@/lib/maps/map-utils';
import { VehicleStatus, STATUS_LABELS } from '@/lib/maps/vehicle-status';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, X } from 'lucide-react';

interface VehicleFilterBarProps {
  vehicles: VehicleLocation[];
  onFilteredChange: (filtered: VehicleLocation[]) => void;
}

const ALL_STATUSES: VehicleStatus[] = ['moving', 'idle', 'offline', 'no-location'];

export default function VehicleFilterBar({ vehicles, onFilteredChange }: VehicleFilterBarProps) {
  const [selectedTruckIds, setSelectedTruckIds] = useState<Set<string>>(new Set());
  const [selectedDriverNames, setSelectedDriverNames] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<VehicleStatus>>(new Set());
  const [hasDispatchOnly, setHasDispatchOnly] = useState(false);

  // Derive unique driver names from vehicles
  const uniqueDrivers = Array.from(
    new Set(vehicles.flatMap((v) => (v.driver ? [v.driver.name] : [])))
  ).sort();

  const activeFilterCount =
    selectedTruckIds.size +
    selectedDriverNames.size +
    selectedStatuses.size +
    (hasDispatchOnly ? 1 : 0);

  const clearAll = () => {
    setSelectedTruckIds(new Set());
    setSelectedDriverNames(new Set());
    setSelectedStatuses(new Set());
    setHasDispatchOnly(false);
  };

  // Recompute filtered vehicles whenever filters or source data changes
  useEffect(() => {
    let result = vehicles;

    if (selectedTruckIds.size > 0) {
      result = result.filter((v) => selectedTruckIds.has(v.truckId));
    }

    if (selectedDriverNames.size > 0) {
      result = result.filter(
        (v) => v.driver && selectedDriverNames.has(v.driver.name)
      );
    }

    if (selectedStatuses.size > 0) {
      result = result.filter((v) => selectedStatuses.has(v.status));
    }

    if (hasDispatchOnly) {
      result = result.filter((v) => v.driver !== null);
    }

    onFilteredChange(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, selectedTruckIds, selectedDriverNames, selectedStatuses, hasDispatchOnly]);

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b shrink-0">
      {/* Vehicle filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            Vehicles
            {selectedTruckIds.size > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {selectedTruckIds.size}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="text-xs font-medium mb-2 text-muted-foreground">Filter by vehicle</div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {vehicles.map((v) => (
              <label
                key={v.truckId}
                className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedTruckIds.has(v.truckId)}
                  onChange={() => setSelectedTruckIds(toggleSet(selectedTruckIds, v.truckId))}
                  className="accent-primary"
                />
                <span className="truncate">{v.truck.licensePlate}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Driver filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            Drivers
            {selectedDriverNames.size > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {selectedDriverNames.size}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="text-xs font-medium mb-2 text-muted-foreground">Filter by driver</div>
          {uniqueDrivers.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">No assigned drivers</p>
          ) : (
            <div className="max-h-40 overflow-y-auto space-y-1">
              {uniqueDrivers.map((name) => (
                <label
                  key={name}
                  className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedDriverNames.has(name)}
                    onChange={() =>
                      setSelectedDriverNames(toggleSet(selectedDriverNames, name))
                    }
                    className="accent-primary"
                  />
                  <span className="truncate">{name}</span>
                </label>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Status filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            Status
            {selectedStatuses.size > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {selectedStatuses.size}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="start">
          <div className="text-xs font-medium mb-2 text-muted-foreground">Filter by status</div>
          <div className="space-y-1">
            {ALL_STATUSES.map((status) => (
              <label
                key={status}
                className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedStatuses.has(status)}
                  onChange={() => setSelectedStatuses(toggleSet(selectedStatuses, status))}
                  className="accent-primary"
                />
                <span>{STATUS_LABELS[status]}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Has Dispatch toggle */}
      <Button
        variant={hasDispatchOnly ? 'default' : 'outline'}
        size="sm"
        className="h-7 text-xs"
        onClick={() => setHasDispatchOnly((p) => !p)}
      >
        Dispatched Only
      </Button>

      {/* Active filter count + clear */}
      {activeFilterCount > 0 && (
        <button
          onClick={clearAll}
          className={cn(
            'flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-1'
          )}
        >
          <X className="h-3 w-3" />
          Clear ({activeFilterCount})
        </button>
      )}
    </div>
  );
}
