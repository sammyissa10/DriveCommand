'use client';

/**
 * Tag Assignment Component
 * Provides UI to assign/unassign tags to trucks and drivers.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { assignTag, unassignTag } from '@/app/(owner)/actions/tags';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Plus, X, Loader2 } from 'lucide-react';

type Tag = {
  id: string;
  name: string;
  color: string;
};

type RawAssignment = {
  id: string;
  tagId: string;
  truckId: string | null;
  userId: string | null;
  truck?: {
    id: string;
    make: string;
    model: string;
    licensePlate: string;
  } | null;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
};

type Assignment = RawAssignment & {
  tag: Tag;
};

type TagWithAssignments = Tag & {
  assignments: RawAssignment[];
};

type Truck = {
  id: string;
  make: string;
  model: string;
  licensePlate: string;
};

type Driver = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

type TagAssignmentProps = {
  tags: TagWithAssignments[];
  trucks: Truck[];
  drivers: Driver[];
};

export function TagAssignment({ tags, trucks, drivers }: TagAssignmentProps) {
  const router = useRouter();
  const [isAssigning, setIsAssigning] = useState<string | null>(null);
  const [isUnassigning, setIsUnassigning] = useState<string | null>(null);
  const [openPopover, setOpenPopover] = useState<string | null>(null);

  // Get assignments for a specific truck (enriched with parent tag)
  const getTruckAssignments = (truckId: string): Assignment[] => {
    const assignments: Assignment[] = [];
    tags.forEach((tag) => {
      tag.assignments.forEach((assignment) => {
        if (assignment.truckId === truckId) {
          assignments.push({ ...assignment, tag: { id: tag.id, name: tag.name, color: tag.color } });
        }
      });
    });
    return assignments;
  };

  // Get assignments for a specific driver (enriched with parent tag)
  const getDriverAssignments = (userId: string): Assignment[] => {
    const assignments: Assignment[] = [];
    tags.forEach((tag) => {
      tag.assignments.forEach((assignment) => {
        if (assignment.userId === userId) {
          assignments.push({ ...assignment, tag: { id: tag.id, name: tag.name, color: tag.color } });
        }
      });
    });
    return assignments;
  };

  // Get available tags for a truck (tags not already assigned)
  const getAvailableTruckTags = (truckId: string): Tag[] => {
    const assignedTagIds = getTruckAssignments(truckId).map((a) => a.tagId);
    return tags.filter((tag) => !assignedTagIds.includes(tag.id));
  };

  // Get available tags for a driver (tags not already assigned)
  const getAvailableDriverTags = (userId: string): Tag[] => {
    const assignedTagIds = getDriverAssignments(userId).map((a) => a.tagId);
    return tags.filter((tag) => !assignedTagIds.includes(tag.id));
  };

  const handleAssignTag = async (tagId: string, entityType: 'truck' | 'driver', entityId: string) => {
    const key = `${entityType}-${entityId}`;
    setIsAssigning(key);

    const formData = new FormData();
    formData.append('tagId', tagId);
    if (entityType === 'truck') {
      formData.append('truckId', entityId);
    } else {
      formData.append('userId', entityId);
    }

    try {
      await assignTag(formData);
      router.refresh();
      setOpenPopover(null);
    } catch (err) {
      console.error('Failed to assign tag:', err);
    } finally {
      setIsAssigning(null);
    }
  };

  const handleUnassignTag = async (assignmentId: string) => {
    setIsUnassigning(assignmentId);
    try {
      await unassignTag(assignmentId);
      router.refresh();
    } catch (err) {
      console.error('Failed to unassign tag:', err);
    } finally {
      setIsUnassigning(null);
    }
  };

  const formatDriverName = (driver: Driver) => {
    if (driver.firstName && driver.lastName) {
      return `${driver.firstName} ${driver.lastName}`;
    }
    return driver.email;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tag Assignments</CardTitle>
        <CardDescription>
          Assign tags to trucks and drivers for filtering across dashboards
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="trucks" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="trucks">Trucks</TabsTrigger>
            <TabsTrigger value="drivers">Drivers</TabsTrigger>
          </TabsList>

          {/* Trucks Tab */}
          <TabsContent value="trucks" className="space-y-4 mt-4">
            {trucks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No trucks available. Create trucks first to assign tags.
              </p>
            ) : (
              <div className="space-y-3">
                {trucks.map((truck) => {
                  const assignments = getTruckAssignments(truck.id);
                  const availableTags = getAvailableTruckTags(truck.id);
                  const popoverKey = `truck-${truck.id}`;

                  return (
                    <div
                      key={truck.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {truck.make} {truck.model}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {truck.licensePlate}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {assignments.map((assignment) => (
                          <Badge
                            key={assignment.id}
                            variant="outline"
                            className="gap-1 pr-1"
                            style={{ borderColor: assignment.tag.color }}
                          >
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: assignment.tag.color }}
                            />
                            <span className="text-xs">{assignment.tag.name}</span>
                            <button
                              type="button"
                              onClick={() => handleUnassignTag(assignment.id)}
                              disabled={isUnassigning === assignment.id}
                              className="ml-1 rounded-sm opacity-70 hover:opacity-100"
                            >
                              {isUnassigning === assignment.id ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <X className="h-2.5 w-2.5" />
                              )}
                            </button>
                          </Badge>
                        ))}

                        {availableTags.length > 0 && (
                          <Popover
                            open={openPopover === popoverKey}
                            onOpenChange={(open) =>
                              setOpenPopover(open ? popoverKey : null)
                            }
                          >
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Plus className="h-3 w-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-2" align="end">
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                  Add Tag
                                </p>
                                {availableTags.map((tag) => (
                                  <button
                                    key={tag.id}
                                    onClick={() =>
                                      handleAssignTag(tag.id, 'truck', truck.id)
                                    }
                                    disabled={isAssigning === popoverKey}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent disabled:opacity-50"
                                  >
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: tag.color }}
                                    />
                                    <span>{tag.name}</span>
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Drivers Tab */}
          <TabsContent value="drivers" className="space-y-4 mt-4">
            {drivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No drivers available. Invite drivers first to assign tags.
              </p>
            ) : (
              <div className="space-y-3">
                {drivers.map((driver) => {
                  const assignments = getDriverAssignments(driver.id);
                  const availableTags = getAvailableDriverTags(driver.id);
                  const popoverKey = `driver-${driver.id}`;

                  return (
                    <div
                      key={driver.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {formatDriverName(driver)}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {driver.email}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {assignments.map((assignment) => (
                          <Badge
                            key={assignment.id}
                            variant="outline"
                            className="gap-1 pr-1"
                            style={{ borderColor: assignment.tag.color }}
                          >
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: assignment.tag.color }}
                            />
                            <span className="text-xs">{assignment.tag.name}</span>
                            <button
                              type="button"
                              onClick={() => handleUnassignTag(assignment.id)}
                              disabled={isUnassigning === assignment.id}
                              className="ml-1 rounded-sm opacity-70 hover:opacity-100"
                            >
                              {isUnassigning === assignment.id ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <X className="h-2.5 w-2.5" />
                              )}
                            </button>
                          </Badge>
                        ))}

                        {availableTags.length > 0 && (
                          <Popover
                            open={openPopover === popoverKey}
                            onOpenChange={(open) =>
                              setOpenPopover(open ? popoverKey : null)
                            }
                          >
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Plus className="h-3 w-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-2" align="end">
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                  Add Tag
                                </p>
                                {availableTags.map((tag) => (
                                  <button
                                    key={tag.id}
                                    onClick={() =>
                                      handleAssignTag(tag.id, 'driver', driver.id)
                                    }
                                    disabled={isAssigning === popoverKey}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent disabled:opacity-50"
                                  >
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: tag.color }}
                                    />
                                    <span>{tag.name}</span>
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
