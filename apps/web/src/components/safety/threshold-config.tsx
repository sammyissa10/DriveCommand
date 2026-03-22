'use client';

import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ThresholdValues {
  harshBraking: number;
  harshAcceleration: number;
  harshCornering: number;
}

interface ThresholdConfig {
  lightDuty: ThresholdValues;
  mediumDuty: ThresholdValues;
  heavyDuty: ThresholdValues;
}

const DEFAULT_THRESHOLDS: ThresholdConfig = {
  lightDuty: {
    harshBraking: 0.45,
    harshAcceleration: 0.35,
    harshCornering: 0.30,
  },
  mediumDuty: {
    harshBraking: 0.35,
    harshAcceleration: 0.30,
    harshCornering: 0.25,
  },
  heavyDuty: {
    harshBraking: 0.25,
    harshAcceleration: 0.20,
    harshCornering: 0.20,
  },
};

const STORAGE_KEY = 'drivecommand-safety-thresholds';

export function ThresholdConfig() {
  const [thresholds, setThresholds] = useState<ThresholdConfig>(DEFAULT_THRESHOLDS);
  const [savedMessage, setSavedMessage] = useState<string>('');

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setThresholds(parsed);
      }
    } catch (error) {
      console.error('Failed to load thresholds from localStorage:', error);
    }
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
      setSavedMessage('Thresholds saved successfully');
      setTimeout(() => setSavedMessage(''), 2000);
    } catch (error) {
      console.error('Failed to save thresholds to localStorage:', error);
      setSavedMessage('Failed to save thresholds');
      setTimeout(() => setSavedMessage(''), 2000);
    }
  };

  const updateThreshold = (
    vehicleClass: keyof ThresholdConfig,
    field: keyof ThresholdValues,
    value: number
  ) => {
    setThresholds((prev) => ({
      ...prev,
      [vehicleClass]: {
        ...prev[vehicleClass],
        [field]: value,
      },
    }));
  };

  const renderThresholdInputs = (
    vehicleClass: keyof ThresholdConfig,
    values: ThresholdValues
  ) => (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Harsh Braking (g)</label>
        <Input
          type="number"
          min="0.1"
          max="5.0"
          step="0.05"
          value={values.harshBraking}
          onChange={(e) =>
            updateThreshold(vehicleClass, 'harshBraking', parseFloat(e.target.value) || 0)
          }
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Harsh Acceleration (g)</label>
        <Input
          type="number"
          min="0.1"
          max="5.0"
          step="0.05"
          value={values.harshAcceleration}
          onChange={(e) =>
            updateThreshold(vehicleClass, 'harshAcceleration', parseFloat(e.target.value) || 0)
          }
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Harsh Cornering (g)</label>
        <Input
          type="number"
          min="0.1"
          max="5.0"
          step="0.05"
          value={values.harshCornering}
          onChange={(e) =>
            updateThreshold(vehicleClass, 'harshCornering', parseFloat(e.target.value) || 0)
          }
          className="mt-1"
        />
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Alert Thresholds
        </CardTitle>
        <CardDescription>G-force sensitivity settings per vehicle class</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="lightDuty">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="lightDuty">Light Duty</TabsTrigger>
            <TabsTrigger value="mediumDuty">Medium Duty</TabsTrigger>
            <TabsTrigger value="heavyDuty">Heavy Duty</TabsTrigger>
          </TabsList>

          <TabsContent value="lightDuty" className="space-y-4">
            {renderThresholdInputs('lightDuty', thresholds.lightDuty)}
          </TabsContent>

          <TabsContent value="mediumDuty" className="space-y-4">
            {renderThresholdInputs('mediumDuty', thresholds.mediumDuty)}
          </TabsContent>

          <TabsContent value="heavyDuty" className="space-y-4">
            {renderThresholdInputs('heavyDuty', thresholds.heavyDuty)}
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex items-center justify-between">
          <Button onClick={handleSave}>Save All Thresholds</Button>
          {savedMessage && (
            <span className="text-sm text-green-600 font-medium">{savedMessage}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
