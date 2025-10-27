import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState } from "react";

export interface ChargebackReason {
  id: string;
  label: string;
}

interface ReasonPickerProps {
  onSelect: (reason: ChargebackReason) => void;
}

const CHARGEBACK_REASONS: ChargebackReason[] = [
  { id: "fraud_card_not_present", label: "Fraud – card not present" },
  { id: "goods_not_received", label: "Goods not received" },
  { id: "services_not_provided", label: "Services not provided" },
  { id: "duplicate_charge", label: "Duplicate charge" },
  { id: "incorrect_amount", label: "Incorrect amount" },
];

export const ReasonPicker = ({ onSelect }: ReasonPickerProps) => {
  const [selectedReason, setSelectedReason] = useState<ChargebackReason | null>(null);

  const handleSelect = (reason: ChargebackReason) => {
    setSelectedReason(reason);
  };

  const handleConfirm = () => {
    if (selectedReason) {
      onSelect(selectedReason);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <h3 className="text-lg font-semibold">Select Chargeback Reason</h3>
      <p className="text-sm text-muted-foreground">
        Choose the reason that best describes your dispute:
      </p>
      <div className="space-y-2">
        {CHARGEBACK_REASONS.map((reason) => (
          <Button
            key={reason.id}
            variant={selectedReason?.id === reason.id ? "default" : "outline"}
            className="w-full justify-start text-left"
            onClick={() => handleSelect(reason)}
          >
            {reason.label}
          </Button>
        ))}
      </div>
      <Button
        onClick={handleConfirm}
        disabled={!selectedReason}
        className="w-full"
      >
        Confirm Reason
      </Button>
    </Card>
  );
};
