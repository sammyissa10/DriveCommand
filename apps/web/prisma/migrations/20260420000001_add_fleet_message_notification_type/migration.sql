-- Add fleet_message to InAppNotificationType enum
ALTER TYPE "InAppNotificationType" ADD VALUE IF NOT EXISTS 'fleet_message';
