'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Mail, Package, Clock } from 'lucide-react';
import { VehicleLocation } from '@/lib/maps/map-utils';

interface TruckRowExpandedProps {
  vehicle: VehicleLocation;
  isExpanded: boolean;
}

export function TruckRowExpanded({ vehicle, isExpanded }: TruckRowExpandedProps) {
  return (
    <AnimatePresence initial={false}>
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="overflow-hidden border-b bg-muted/30"
        >
          <div className="py-4 px-6">
            <div className="grid grid-cols-3 gap-6">
              {/* Driver Contact */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Driver Contact</h3>
                {vehicle.driver ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">
                        (555) 123-4567
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground truncate">
                        driver@example.com
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No driver assigned</p>
                )}
              </div>

              {/* Load List */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Load List</h3>
                {vehicle.dispatch && vehicle.dispatch.loadCount > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm">
                      <Package className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">Load #1234</div>
                        <div className="text-xs text-muted-foreground truncate">
                          Chicago, IL to Dallas, TX
                        </div>
                      </div>
                    </div>
                    {vehicle.dispatch.loadCount > 1 && (
                      <div className="text-xs text-muted-foreground pl-6">
                        +{vehicle.dispatch.loadCount - 1} more load{vehicle.dispatch.loadCount - 1 > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No active loads</p>
                )}
              </div>

              {/* Activity Log */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Activity Log</h3>
                {vehicle.dispatch ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-muted-foreground">
                          Arrived at Stop 2
                        </div>
                        <div className="text-xs text-muted-foreground">
                          10:23 AM
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-muted-foreground">
                          Departed Stop 1
                        </div>
                        <div className="text-xs text-muted-foreground">
                          8:45 AM
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
