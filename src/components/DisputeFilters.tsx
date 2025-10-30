import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ListFilter, X } from "lucide-react";

export interface DisputeFiltersType {
  currentStatus?: string;
  acquirerName?: string;
  merchantCategoryCode?: string;
  merchantId?: string;
  merchantName?: string;
  referenceNumber?: string;
  tid?: string;
  transactionAmountMin?: number;
  transactionAmountMax?: number;
  transactionCurrency?: string;
  refundAmountMin?: number;
  refundAmountMax?: number;
  settled?: string;
  refundReceived?: string;
  settlementDateFrom?: string;
  settlementDateTo?: string;
  transactionTimeFrom?: string;
  transactionTimeTo?: string;
}

interface DisputeFiltersProps {
  filters: DisputeFiltersType;
  onFiltersChange: (filters: DisputeFiltersType) => void;
  onApply: () => void;
}

const DisputeFilters = ({ filters, onFiltersChange, onApply }: DisputeFiltersProps) => {
  const [open, setOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<DisputeFiltersType>(filters);

  const handleApply = () => {
    onFiltersChange(localFilters);
    onApply();
    setOpen(false);
  };

  const handleReset = () => {
    const emptyFilters: DisputeFiltersType = {};
    setLocalFilters(emptyFilters);
    onFiltersChange(emptyFilters);
    onApply();
  };

  const activeFilterCount = Object.values(localFilters).filter(v => v !== undefined && v !== '').length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <ListFilter className="h-4 w-4 mr-2" />
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-2 bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Filter disputes by any column
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Current Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Current Status</Label>
            <Select
              value={localFilters.currentStatus}
              onValueChange={(value) =>
                setLocalFilters({ ...localFilters, currentStatus: value })
              }
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="started">Started</SelectItem>
                <SelectItem value="transaction_selected">Transaction Selected</SelectItem>
                <SelectItem value="eligibility_checked">Eligibility Checked</SelectItem>
                <SelectItem value="reason_selected">Reason Selected</SelectItem>
                <SelectItem value="documents_uploaded">Documents Uploaded</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Acquirer Name */}
          <div className="space-y-2">
            <Label htmlFor="acquirer">Acquirer Name</Label>
            <Input
              id="acquirer"
              placeholder="Enter acquirer name"
              value={localFilters.acquirerName || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, acquirerName: e.target.value })
              }
            />
          </div>

          {/* Merchant Category Code */}
          <div className="space-y-2">
            <Label htmlFor="mcc">Merchant Category Code</Label>
            <Input
              id="mcc"
              placeholder="Enter MCC code"
              value={localFilters.merchantCategoryCode || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, merchantCategoryCode: e.target.value })
              }
            />
          </div>

          {/* Merchant ID */}
          <div className="space-y-2">
            <Label htmlFor="merchantId">Merchant ID</Label>
            <Input
              id="merchantId"
              placeholder="Enter merchant ID"
              value={localFilters.merchantId || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, merchantId: e.target.value })
              }
            />
          </div>

          {/* Merchant Name */}
          <div className="space-y-2">
            <Label htmlFor="merchantName">Merchant Name</Label>
            <Input
              id="merchantName"
              placeholder="Enter merchant name"
              value={localFilters.merchantName || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, merchantName: e.target.value })
              }
            />
          </div>

          {/* Reference Number */}
          <div className="space-y-2">
            <Label htmlFor="refNumber">Reference Number</Label>
            <Input
              id="refNumber"
              placeholder="Enter reference number"
              value={localFilters.referenceNumber || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, referenceNumber: e.target.value })
              }
            />
          </div>

          {/* Tid */}
          <div className="space-y-2">
            <Label htmlFor="tid">Tid</Label>
            <Input
              id="tid"
              placeholder="Enter TID"
              value={localFilters.tid || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, tid: e.target.value })
              }
            />
          </div>

          {/* Transaction Amount Range */}
          <div className="space-y-2">
            <Label>Transaction Amount (Min)</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={localFilters.transactionAmountMin || ''}
              onChange={(e) =>
                setLocalFilters({
                  ...localFilters,
                  transactionAmountMin: e.target.value ? parseFloat(e.target.value) : undefined,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Transaction Amount (Max)</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={localFilters.transactionAmountMax || ''}
              onChange={(e) =>
                setLocalFilters({
                  ...localFilters,
                  transactionAmountMax: e.target.value ? parseFloat(e.target.value) : undefined,
                })
              }
            />
          </div>

          {/* Transaction Currency */}
          <div className="space-y-2">
            <Label htmlFor="currency">Transaction Currency</Label>
            <Select
              value={localFilters.transactionCurrency}
              onValueChange={(value) =>
                setLocalFilters({ ...localFilters, transactionCurrency: value })
              }
            >
              <SelectTrigger id="currency">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="INR">INR</SelectItem>
                <SelectItem value="AUD">AUD</SelectItem>
                <SelectItem value="CAD">CAD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Transaction Time Range */}
          <div className="space-y-2">
            <Label htmlFor="timeFrom">Transaction Time (From)</Label>
            <Input
              id="timeFrom"
              type="date"
              value={localFilters.transactionTimeFrom || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, transactionTimeFrom: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeTo">Transaction Time (To)</Label>
            <Input
              id="timeTo"
              type="date"
              value={localFilters.transactionTimeTo || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, transactionTimeTo: e.target.value })
              }
            />
          </div>

          {/* Refund Amount Range */}
          <div className="space-y-2">
            <Label>Refund Amount (Min)</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={localFilters.refundAmountMin || ''}
              onChange={(e) =>
                setLocalFilters({
                  ...localFilters,
                  refundAmountMin: e.target.value ? parseFloat(e.target.value) : undefined,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Refund Amount (Max)</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={localFilters.refundAmountMax || ''}
              onChange={(e) =>
                setLocalFilters({
                  ...localFilters,
                  refundAmountMax: e.target.value ? parseFloat(e.target.value) : undefined,
                })
              }
            />
          </div>

          {/* Refund Received */}
          <div className="space-y-2">
            <Label htmlFor="refundReceived">Refund Received</Label>
            <Select
              value={localFilters.refundReceived}
              onValueChange={(value) =>
                setLocalFilters({ ...localFilters, refundReceived: value })
              }
            >
              <SelectTrigger id="refundReceived">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Settled */}
          <div className="space-y-2">
            <Label htmlFor="settled">Settled</Label>
            <Select
              value={localFilters.settled}
              onValueChange={(value) =>
                setLocalFilters({ ...localFilters, settled: value })
              }
            >
              <SelectTrigger id="settled">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Settlement Date Range */}
          <div className="space-y-2">
            <Label htmlFor="settlementFrom">Settlement Date (From)</Label>
            <Input
              id="settlementFrom"
              type="date"
              value={localFilters.settlementDateFrom || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, settlementDateFrom: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settlementTo">Settlement Date (To)</Label>
            <Input
              id="settlementTo"
              type="date"
              value={localFilters.settlementDateTo || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, settlementDateTo: e.target.value })
              }
            />
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t sticky bottom-0 bg-background pb-4">
          <Button variant="outline" onClick={handleReset} className="flex-1">
            <X className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleApply} className="flex-1">
            Apply Filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DisputeFilters;
