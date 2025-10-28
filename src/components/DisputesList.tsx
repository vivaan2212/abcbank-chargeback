import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import DisputeDetail from "./DisputeDetail";
import { Button } from "@/components/ui/button";

interface Dispute {
  id: string;
  conversation_id: string;
  customer_id: string;
  transaction_id: string | null;
  status: string;
  eligibility_status: string | null;
  reason_id: string | null;
  reason_label: string | null;
  custom_reason: string | null;
  documents: any;
  eligibility_reasons: string[] | null;
  created_at: string;
  updated_at: string;
  transaction?: {
    transaction_id: number;
    transaction_time: string;
    transaction_amount: number;
    transaction_currency: string;
    merchant_name: string;
    merchant_id: number;
    merchant_category_code: number;
    acquirer_name: string;
  };
}

interface DisputesListProps {
  statusFilter: string;
  userId: string;
}

const DisputesList = ({ statusFilter, userId }: DisputesListProps) => {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDisputes();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('disputes-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'disputes',
          filter: `customer_id=eq.${userId}`,
        },
        () => {
          loadDisputes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter, userId]);

  const loadDisputes = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from("disputes")
        .select(`
          *,
          transaction:transactions(
            transaction_id,
            transaction_time,
            transaction_amount,
            transaction_currency,
            merchant_name,
            merchant_id,
            merchant_category_code,
            acquirer_name
          )
        `)
        .eq("customer_id", userId)
        .order("updated_at", { ascending: false });

      // Filter by status category
      if (statusFilter === "in_progress") {
        query = query.in("status", [
          "started",
          "transaction_selected",
          "eligibility_checked",
          "reason_selected",
          "documents_uploaded",
          "under_review"
        ]);
      } else if (statusFilter === "done") {
        query = query.in("status", ["approved", "completed"]);
      } else if (statusFilter === "needs_attention") {
        query = query.in("status", ["requires_action"]);
      } else if (statusFilter === "void") {
        query = query.in("status", ["rejected", "cancelled"]);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Filter out disputes without transactions for in_progress tab
      const filteredData = data?.filter(d => d.transaction_id !== null) || [];
      setDisputes(filteredData);
    } catch (error) {
      console.error("Error loading disputes:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      started: "Started",
      transaction_selected: "Transaction selected",
      eligibility_checked: "Eligibility checked",
      reason_selected: "Reason selected",
      documents_uploaded: "Documents uploaded",
      under_review: "Chargeback filing in progress...",
      approved: "Approved",
      completed: "Completed",
      rejected: "Rejected",
      cancelled: "Cancelled",
      requires_action: "Requires action"
    };
    return statusMap[status] || status;
  };

  if (selectedDispute) {
    return (
      <div>
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => setSelectedDispute(null)}
        >
          ← Back to list
        </Button>
        <DisputeDetail dispute={selectedDispute} />
      </div>
    );
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading disputes...</div>;
  }

  if (disputes.length === 0) {
    return <div className="text-muted-foreground">No disputes found</div>;
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Current Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Acquirer Name</TableHead>
            <TableHead>Merchant Category Code</TableHead>
            <TableHead>Merchant Id</TableHead>
            <TableHead>Merchant Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {disputes.map((dispute) => (
            <TableRow
              key={dispute.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => setSelectedDispute(dispute)}
            >
              <TableCell>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </TableCell>
              <TableCell className="font-medium">
                {getStatusLabel(dispute.status)}
              </TableCell>
              <TableCell>
                {dispute.transaction?.transaction_time
                  ? format(new Date(dispute.transaction.transaction_time), "dd MMM")
                  : "-"}
              </TableCell>
              <TableCell>{dispute.transaction?.acquirer_name || "-"}</TableCell>
              <TableCell>{dispute.transaction?.merchant_category_code || "-"}</TableCell>
              <TableCell>{dispute.transaction?.merchant_id || "-"}</TableCell>
              <TableCell>{dispute.transaction?.merchant_name || "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default DisputesList;
