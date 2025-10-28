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
  userId?: string;
}

const DisputesList = ({ statusFilter, userId }: DisputesListProps) => {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDisputes();

    // Subscribe to real-time updates
    const subscribeConfig: any = {
      event: '*',
      schema: 'public',
      table: 'disputes',
    };
    
    // Only add customer filter if userId is provided
    if (userId) {
      subscribeConfig.filter = `customer_id=eq.${userId}`;
    }

    const channel = supabase
      .channel('disputes-changes')
      .on('postgres_changes', subscribeConfig, () => {
        loadDisputes();
      })
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
        .order("updated_at", { ascending: false });
      
      // Only filter by customer_id if userId is provided (customer view)
      if (userId) {
        query = query.eq("customer_id", userId);
      }

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

  return (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Current Status</TableHead>
              <TableHead>Acquirer Name</TableHead>
              <TableHead>Merchant Category Code</TableHead>
              <TableHead>Merchant ID</TableHead>
              <TableHead>Merchant Name</TableHead>
              <TableHead>Reference Number</TableHead>
              <TableHead>Tid</TableHead>
              <TableHead>Transaction Amount</TableHead>
              <TableHead>Transaction Currency</TableHead>
              <TableHead>Transaction Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {disputes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-64">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold mb-1">No records yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Get started by importing your data or connecting a data source
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">Import</Button>
                      <Button variant="outline" size="sm">Connect</Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              disputes.map((dispute) => (
                <TableRow
                  key={dispute.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => setSelectedDispute(dispute)}
                >
                  <TableCell className="font-medium">
                    {getStatusLabel(dispute.status)}
                  </TableCell>
                  <TableCell>{dispute.transaction?.acquirer_name || "-"}</TableCell>
                  <TableCell>{dispute.transaction?.merchant_category_code || "-"}</TableCell>
                  <TableCell>{dispute.transaction?.merchant_id || "-"}</TableCell>
                  <TableCell>{dispute.transaction?.merchant_name || "-"}</TableCell>
                  <TableCell>{dispute.transaction?.transaction_id || "-"}</TableCell>
                  <TableCell>{dispute.transaction_id ? dispute.transaction_id.toString().slice(-6) : "-"}</TableCell>
                  <TableCell>{dispute.transaction?.transaction_amount || "-"}</TableCell>
                  <TableCell>{dispute.transaction?.transaction_currency || "-"}</TableCell>
                  <TableCell>
                    {dispute.transaction?.transaction_time
                      ? format(new Date(dispute.transaction.transaction_time), "MMM dd, yyyy HH:mm")
                      : "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {disputes.length} of {disputes.length} results
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DisputesList;
