'use client';

import { useState, useMemo } from 'react';
import { features } from '@/lib/docs/feature-registry';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export default function AdminFeaturesListPage() {
  const [portalFilter, setPortalFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      if (portalFilter !== 'all' && f.portal !== portalFilter) return false;
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      return true;
    });
  }, [portalFilter, categoryFilter, statusFilter]);

  const isStale = (lastReviewedAt: string) => {
    const lastReviewed = new Date(lastReviewedAt);
    const now = new Date();
    const ageMs = now.getTime() - lastReviewed.getTime();
    return ageMs > NINETY_DAYS_MS;
  };

  // Extract unique values for filters
  const portals = Array.from(new Set(features.map((f) => f.portal)));
  const categories = Array.from(new Set(features.map((f) => f.category)));
  const statuses = Array.from(new Set(features.map((f) => f.status)));

  return (
    <div className="max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          Feature Reference
        </h1>
        <p className="text-gray-600">
          Browse all {features.length} features in the registry
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Select value={portalFilter} onValueChange={setPortalFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Portal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Portals</SelectItem>
            {portals.map((p) => (
              <SelectItem key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Portal</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Plan Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Reviewed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFeatures.map((feature) => (
              <TableRow key={feature.slug}>
                <TableCell>
                  <Link
                    href={`/docs/features/${feature.slug}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {feature.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs text-gray-600">
                  {feature.slug}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {feature.portal}
                  </Badge>
                </TableCell>
                <TableCell className="capitalize">{feature.category}</TableCell>
                <TableCell className="capitalize">{feature.planTier}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      feature.status === 'stable'
                        ? 'default'
                        : feature.status === 'beta'
                        ? 'secondary'
                        : 'outline'
                    }
                  >
                    {feature.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {isStale(feature.lastDocReviewedAt) && (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span className="text-sm text-gray-600">
                      {new Date(feature.lastDocReviewedAt).toLocaleDateString()}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
