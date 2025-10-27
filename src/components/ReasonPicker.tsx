import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

export interface ChargebackReason {
  id: string;
  label: string;
  customReason?: string;
}

interface ReasonPickerProps {
  onSelect: (reason: ChargebackReason) => void;
}

const CHARGEBACK_REASONS: ChargebackReason[] = [
  { id: "fraud", label: "Fraudulent or Unauthorized Transaction" },
  { id: "not_received", label: "Goods or Services Not Received" },
  { id: "duplicate", label: "Duplicate Charges" },
  { id: "incorrect_amount", label: "Incorrect Transaction Amount" },
  { id: "other", label: "Other (please describe)" },
];

export const ReasonPicker = ({ onSelect }: ReasonPickerProps) => {
  const [selectedReason, setSelectedReason] = useState<ChargebackReason | null>(null);
  const [customReason, setCustomReason] = useState("");

  const handleSelect = (reason: ChargebackReason) => {
    setSelectedReason(reason);
  };

  const handleConfirm = () => {
    if (selectedReason) {
      if (selectedReason.id === "other" && customReason.trim()) {
        onSelect({ ...selectedReason, customReason: customReason.trim() });
      } else if (selectedReason.id !== "other") {
        onSelect(selectedReason);
      }
    }
  };

  const isConfirmDisabled = !selectedReason || (selectedReason.id === "other" && !customReason.trim());

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
      {selectedReason?.id === "other" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Please describe your reason:</label>
          <Textarea
            placeholder="Enter your custom reason..."
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>
      )}
      <Button
        onClick={handleConfirm}
        disabled={isConfirmDisabled}
        className="w-full"
      >
        Confirm Reason
      </Button>
    </Card>
  );
};
