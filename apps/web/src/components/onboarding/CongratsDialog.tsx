"use client";

import { useRouter } from "next/navigation";
import { PartyPopper } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CongratsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One-time activation-complete congratulations moment.
 * Shown exactly once when a tenant's onboarding finishes (isActivated=true, congratsShownAt=null).
 */
export function CongratsDialog({ open, onOpenChange }: CongratsDialogProps) {
  const router = useRouter();

  function handleContinue() {
    onOpenChange(false);
    router.push("/carrier/dashboard");
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <PartyPopper className="h-5 w-5 text-primary shrink-0" />
            <AlertDialogTitle>Your fleet is all set!</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Onboarding is complete. Your trucks, drivers, clients, and first
            load are ready to roll — welcome to DriveCommand.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleContinue}>
            Go to Dashboard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
