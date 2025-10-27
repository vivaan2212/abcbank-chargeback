import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

interface Transaction {
  id: string;
  transaction_id: number;
  transaction_time: string;
  transaction_amount: number;
  transaction_currency: string;
  merchant_name: string;
  merchant_category_code: number;
  acquirer_name: string;
  is_wallet_transaction: boolean;
}

interface TransactionListProps {
  transactions: Transaction[];
  onSelect: (transaction: Transaction) => void;
}

const TransactionList = ({ transactions, onSelect }: TransactionListProps) => {
  const [selectedId, setSelectedId] = useState<string>("");

  const handleSelect = () => {
    const selected = transactions.find((t) => t.id === selectedId);
    if (selected) {
      onSelect(selected);
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground mb-4">No transactions in last 120 days</p>
        <Button disabled variant="outline">Manual Entry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RadioGroup value={selectedId} onValueChange={setSelectedId}>
        {transactions.map((transaction) => (
          <Card
            key={transaction.id}
            className={`p-4 cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${
              selectedId === transaction.id ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setSelectedId(transaction.id)}
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value={transaction.id} id={transaction.id} className="mt-1" />
              <Label htmlFor={transaction.id} className="flex-1 cursor-pointer">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-lg">{transaction.merchant_name}</span>
                    <span className="font-bold text-lg">
                      {transaction.transaction_amount.toFixed(2)} {transaction.transaction_currency}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium">Date:</span>{" "}
                      {format(new Date(transaction.transaction_time), "dd MMM yyyy")}
                    </div>
                    <div>
                      <span className="font-medium">Acquirer:</span> {transaction.acquirer_name}
                    </div>
                    <div>
                      <span className="font-medium">MCC:</span> {transaction.merchant_category_code}
                    </div>
                    <div>
                      <span className="font-medium">Type:</span>{" "}
                      {transaction.is_wallet_transaction ? "Wallet" : "Card"}
                    </div>
                  </div>
                </div>
              </Label>
            </div>
          </Card>
        ))}
      </RadioGroup>
      <div className="flex justify-center pt-2">
        <Button onClick={handleSelect} disabled={!selectedId} size="lg">
          Select Transaction
        </Button>
      </div>
    </div>
  );
};

export default TransactionList;
