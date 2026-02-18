'use client';

/**
 * Tag Filter Component
 * Dropdown filter to filter dashboard data by tag.
 * Updates URL searchParams when tag selection changes.
 */

import { useRouter, usePathname } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Tag = {
  id: string;
  name: string;
  color: string;
};

type TagFilterProps = {
  tags: Tag[];
  selectedTagId: string | null;
};

export function TagFilter({ tags, selectedTagId }: TagFilterProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleValueChange = (value: string) => {
    if (value === 'all') {
      // "All Vehicles" selected - remove tagId param
      router.push(pathname);
    } else {
      // Tag selected - add tagId param
      router.push(`${pathname}?tagId=${value}`);
    }
  };

  return (
    <div className="w-[200px]">
      <Select value={selectedTagId || 'all'} onValueChange={handleValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Filter by tag" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Vehicles</SelectItem>
          {tags.map((tag) => (
            <SelectItem key={tag.id} value={tag.id}>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span>{tag.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
