'use client';

import { useState } from 'react';
import {
  predictLoadProfitability,
  PredictionResult,
} from '@/app/(owner)/actions/profit-predictor';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

function formatCurrency(value: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(parseFloat(value));
}

export function ProfitPredictorForm() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [distanceMiles, setDistanceMiles] = useState('');
  const [offeredRate, setOfferedRate] = useState('');
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate inputs
    if (!origin.trim()) {
      setError('Origin is required.');
      return;
    }
    if (!destination.trim()) {
      setError('Destination is required.');
      return;
    }
    const parsedDistance = parseFloat(distanceMiles);
    if (!distanceMiles || isNaN(parsedDistance) || parsedDistance <= 0) {
      setError('Distance must be a number greater than 0.');
      return;
    }
    const parsedRate = parseFloat(offeredRate);
    if (!offeredRate || isNaN(parsedRate) || parsedRate <= 0) {
      setError('Offered rate must be a number greater than 0.');
      return;
    }

    setLoading(true);
    try {
      const prediction = await predictLoadProfitability({
        origin: origin.trim(),
        destination: destination.trim(),
        distanceMiles: parsedDistance,
        offeredRate: parsedRate,
      });
      setResult(prediction);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  const recommendationConfig = result
    ? {
        accept: {
          bg: 'bg-green-50 border-green-200',
          text: 'text-green-800',
          icon: <CheckCircle className="h-5 w-5 text-green-600" />,
          label: 'Recommended: Accept Load',
        },
        caution: {
          bg: 'bg-amber-50 border-amber-200',
          text: 'text-amber-800',
          icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
          label: 'Proceed with Caution',
        },
        reject: {
          bg: 'bg-red-50 border-red-200',
          text: 'text-red-800',
          icon: <XCircle className="h-5 w-5 text-red-600" />,
          label: 'Not Recommended: Low/Negative Margin',
        },
      }[result.recommendation]
    : null;

  const marginColor = result
    ? result.recommendation === 'accept'
      ? 'text-green-600'
      : result.recommendation === 'reject'
        ? 'text-red-600'
        : 'text-amber-600'
    : '';

  const profitColor = result
    ? parseFloat(result.predictedProfit) >= 0
      ? 'text-green-600'
      : 'text-red-600'
    : '';

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Load Details</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Origin */}
            <div className="space-y-1.5">
              <label
                htmlFor="origin"
                className="text-sm font-medium text-foreground"
              >
                Origin
              </label>
              <input
                id="origin"
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="e.g. Chicago, IL"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>

            {/* Destination */}
            <div className="space-y-1.5">
              <label
                htmlFor="destination"
                className="text-sm font-medium text-foreground"
              >
                Destination
              </label>
              <input
                id="destination"
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Dallas, TX"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>

            {/* Distance */}
            <div className="space-y-1.5">
              <label
                htmlFor="distanceMiles"
                className="text-sm font-medium text-foreground"
              >
                Distance (miles)
              </label>
              <input
                id="distanceMiles"
                type="number"
                min="1"
                value={distanceMiles}
                onChange={(e) => setDistanceMiles(e.target.value)}
                placeholder="e.g. 850"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>

            {/* Offered Rate */}
            <div className="space-y-1.5">
              <label
                htmlFor="offeredRate"
                className="text-sm font-medium text-foreground"
              >
                Offered Rate ($)
              </label>
              <input
                id="offeredRate"
                type="number"
                min="0"
                step="0.01"
                value={offeredRate}
                onChange={(e) => setOfferedRate(e.target.value)}
                placeholder="e.g. 2500.00"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Calculating...' : 'Predict Profitability'}
          </button>
        </form>
      </div>

      {/* Result Section */}
      {result !== null && recommendationConfig !== null && (
        <div className="space-y-4">
          {/* Recommendation Banner */}
          <div
            className={`flex items-center gap-3 rounded-xl border px-5 py-4 ${recommendationConfig.bg}`}
          >
            {recommendationConfig.icon}
            <span className={`text-base font-semibold ${recommendationConfig.text}`}>
              {recommendationConfig.label}
            </span>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Offered Rate */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Offered Rate
              </p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(result.offeredRate)}
              </p>
            </div>

            {/* Predicted Expenses */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Predicted Expenses
              </p>
              <p className="mt-2 text-2xl font-bold text-red-600">
                {formatCurrency(result.predictedExpenses)}
              </p>
            </div>

            {/* Predicted Profit */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Predicted Profit
              </p>
              <p className={`mt-2 text-2xl font-bold ${profitColor}`}>
                {formatCurrency(result.predictedProfit)}
              </p>
            </div>

            {/* Margin */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Margin
              </p>
              <p className={`mt-2 text-2xl font-bold ${marginColor}`}>
                {result.predictedMarginPercent.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Data Source & Cost Per Mile */}
          <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm space-y-1">
            <p className="text-sm text-muted-foreground">
              {result.dataSource === 'lane' &&
                `Based on ${result.laneRouteCount} historical route${result.laneRouteCount !== 1 ? 's' : ''} on ${origin.trim().toUpperCase()} \u2192 ${destination.trim().toUpperCase()}`}
              {result.dataSource === 'fleet' &&
                'No lane history found \u2014 using fleet average cost-per-mile'}
              {result.dataSource === 'none' &&
                'No historical data available \u2014 enter expenses manually'}
            </p>
            <p className="text-sm font-medium text-muted-foreground">
              Cost per mile used:{' '}
              <span className="font-semibold text-foreground">
                ${result.costPerMileUsed}/mi
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
