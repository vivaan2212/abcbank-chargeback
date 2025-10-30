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
import { ArrowUpDown, ArrowUp, ArrowDown, Square } from "lucide-react";
import type { DisputeFiltersType } from "./DisputeFilters";

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
  order_details: string | null;
  documents: any;
  eligibility_reasons: string[] | null;
  created_at: string;
  updated_at: string;
  transaction?: {
    id?: string;
    transaction_id?: number;
    transaction_time?: string;
    transaction_amount?: number;
    transaction_currency?: string;
    merchant_name?: string;
    merchant_id?: number;
    merchant_category_code?: number;
    acquirer_name?: string;
    refund_amount?: number;
    refund_received?: boolean;
    settled?: boolean;
    settlement_date?: string | null;
    local_transaction_amount?: number;
    local_transaction_currency?: string;
    is_wallet_transaction?: boolean;
    wallet_type?: string | null;
    pos_entry_mode?: number;
    secured_indication?: number;
    dispute_status?: string;
    needs_attention?: boolean;
    temporary_credit_provided?: boolean;
    temporary_credit_amount?: number;
    temporary_credit_currency?: string;
  };
  chargeback_actions?: Array<{
    id: string;
    action_type: string;
    admin_message: string;
    temporary_credit_issued: boolean;
    chargeback_filed: boolean;
    awaiting_settlement: boolean;
    awaiting_merchant_refund: boolean;
    requires_manual_review: boolean;
    net_amount: number;
    days_since_transaction: number;
    days_since_settlement: number | null;
    is_secured_otp: boolean;
    is_unsecured: boolean;
    merchant_category_code: number;
    is_restricted_mcc: boolean;
    is_facebook_meta: boolean;
    created_at: string;
    updated_at: string;
  }>;
}

interface DisputesListProps {
  statusFilter: string;
  userId?: string;
  filters?: DisputeFiltersType;
  onDisputeSelect?: (dispute: { id: string; transactionId: string | null; status: string }) => void;
}

const DisputesList = ({ statusFilter, userId, filters, onDisputeSelect }: DisputesListProps) => {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadDisputes();

    // Subscribe to real-time updates for disputes
    const disputesChannel = supabase
      .channel('disputes-dashboard-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'disputes',
        },
        (payload) => {
          console.log('Dispute change detected:', payload);
          loadDisputes();
        }
      )
      .subscribe((status) => {
        console.log('Disputes subscription status:', status);
      });

    // Subscribe to representment status changes
    const repChannel = supabase
      .channel('representment-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chargeback_representment_static',
        },
        (payload) => {
          console.log('Representment status change detected:', payload);
          loadDisputes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(disputesChannel);
      supabase.removeChannel(repChannel);
    };
  }, [statusFilter, userId, filters, sortField, sortDirection]);

  const loadDisputes = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from("disputes")
        .select(`
          *,
          transaction:transactions(
            id,
            transaction_id,
            transaction_time,
            transaction_amount,
            transaction_currency,
            merchant_name,
            merchant_id,
            merchant_category_code,
            acquirer_name,
            refund_amount,
            refund_received,
            settled,
            settlement_date,
            local_transaction_amount,
            local_transaction_currency,
            is_wallet_transaction,
            wallet_type,
            pos_entry_mode,
            secured_indication,
            dispute_status,
            needs_attention,
            temporary_credit_provided,
            temporary_credit_amount,
            temporary_credit_currency,
            chargeback_representment_static(
              id,
              will_be_represented,
              representment_status,
              merchant_document_url,
              merchant_reason_text,
              source
            )
          ),
          chargeback_actions(
            id,
            action_type,
            admin_message,
            temporary_credit_issued,
            chargeback_filed,
            awaiting_settlement,
            awaiting_merchant_refund,
            requires_manual_review,
            net_amount,
            days_since_transaction,
            days_since_settlement,
            is_secured_otp,
            is_unsecured,
            merchant_category_code,
            is_restricted_mcc,
            is_facebook_meta,
            created_at,
            updated_at
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
          "under_review",
          "awaiting_investigation",
          "chargeback_filed",
          "awaiting_merchant_refund"
        ]);
      } else if (statusFilter === "done") {
        query = query.in("status", ["approved", "completed", "ineligible", "closed_lost", "representment_contested"]);
      } else if (statusFilter === "needs_attention") {
        // Intentionally do not restrict by status; we'll compute from logs and flags
      } else if (statusFilter === "void") {
        query = query.in("status", ["rejected", "cancelled", "expired"]);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Only show disputes on dashboard after transaction selection
      let filteredData = data?.filter(d => d.transaction_id !== null) || [];

      // Special handling for needs_attention
      if (statusFilter === 'needs_attention') {
        filteredData = filteredData.filter(dispute => {
          const repStatus = (dispute.transaction as any)?.chargeback_representment_static?.representment_status;
          return repStatus === 'pending' || 
                 ['requires_action', 'pending_manual_review', 'awaiting_settlement'].includes(dispute.status);
        });
      }

      // Special handling for awaiting_customer filter
      if (statusFilter === 'awaiting_customer') {
        filteredData = filteredData.filter(dispute => {
          const repStatus = (dispute.transaction as any)?.chargeback_representment_static?.representment_status;
          return repStatus === 'awaiting_customer_info';
        });
      }

      // Special handling for done
      if (statusFilter === 'done') {
        filteredData = filteredData.filter(dispute => {
          const repStatus = (dispute.transaction as any)?.chargeback_representment_static?.representment_status;
          return repStatus === 'no_representment' || 
                 repStatus === 'accepted_by_bank' ||
                 dispute.transaction?.dispute_status === 'closed_won' ||
                 dispute.transaction?.dispute_status === 'closed_lost';
        });
      }

      // Apply additional filters from filter panel
      if (filters) {
        filteredData = filteredData.filter((dispute) => {
          // Current Status
          if (filters.currentStatus && dispute.status !== filters.currentStatus) return false;

          // Transaction fields - only check if transaction exists AND filter is set
          const txn = dispute.transaction;

          // Acquirer Name
          if (filters.acquirerName) {
            if (!txn || !txn.acquirer_name?.toLowerCase().includes(filters.acquirerName.toLowerCase())) return false;
          }

          // Merchant Category Code
          if (filters.merchantCategoryCode) {
            if (!txn || !txn.merchant_category_code?.toString().includes(filters.merchantCategoryCode)) return false;
          }

          // Merchant ID
          if (filters.merchantId) {
            if (!txn || !txn.merchant_id?.toString().includes(filters.merchantId)) return false;
          }

          // Merchant Name
          if (filters.merchantName) {
            if (!txn || !txn.merchant_name?.toLowerCase().includes(filters.merchantName.toLowerCase())) return false;
          }

          // Reference Number (transaction_id)
          if (filters.referenceNumber) {
            if (!txn || !txn.transaction_id?.toString().includes(filters.referenceNumber)) return false;
          }

          // Tid
          if (filters.tid) {
            if (!dispute.transaction_id?.toString().includes(filters.tid)) return false;
          }

          // Transaction Amount Range
          if (filters.transactionAmountMin !== undefined) {
            if (!txn || txn.transaction_amount === undefined || txn.transaction_amount < filters.transactionAmountMin) return false;
          }
          if (filters.transactionAmountMax !== undefined) {
            if (!txn || txn.transaction_amount === undefined || txn.transaction_amount > filters.transactionAmountMax) return false;
          }

          // Transaction Currency
          if (filters.transactionCurrency) {
            if (!txn || txn.transaction_currency !== filters.transactionCurrency) return false;
          }

          // Transaction Time Range
          if (filters.transactionTimeFrom) {
            if (!txn || !txn.transaction_time) return false;
            const txnDate = new Date(txn.transaction_time);
            const fromDate = new Date(filters.transactionTimeFrom);
            if (txnDate < fromDate) return false;
          }
          if (filters.transactionTimeTo) {
            if (!txn || !txn.transaction_time) return false;
            const txnDate = new Date(txn.transaction_time);
            const toDate = new Date(filters.transactionTimeTo);
            toDate.setHours(23, 59, 59, 999);
            if (txnDate > toDate) return false;
          }

          // Refund Amount Range
          if (filters.refundAmountMin !== undefined) {
            if (!txn || txn.refund_amount === undefined || txn.refund_amount < filters.refundAmountMin) return false;
          }
          if (filters.refundAmountMax !== undefined) {
            if (!txn || txn.refund_amount === undefined || txn.refund_amount > filters.refundAmountMax) return false;
          }

          // Refund Received
          if (filters.refundReceived === 'yes') {
            if (!txn || !txn.refund_received) return false;
          }
          if (filters.refundReceived === 'no') {
            if (!txn || txn.refund_received) return false;
          }

          // Settled
          if (filters.settled === 'yes') {
            if (!txn || !txn.settled) return false;
          }
          if (filters.settled === 'no') {
            if (!txn || txn.settled) return false;
          }

          // Settlement Date Range
          if (filters.settlementDateFrom) {
            if (!txn || !txn.settlement_date) return false;
            const settlementDate = new Date(txn.settlement_date);
            const fromDate = new Date(filters.settlementDateFrom);
            if (settlementDate < fromDate) return false;
          }
          if (filters.settlementDateTo) {
            if (!txn || !txn.settlement_date) return false;
            const settlementDate = new Date(txn.settlement_date);
            const toDate = new Date(filters.settlementDateTo);
            toDate.setHours(23, 59, 59, 999);
            if (settlementDate > toDate) return false;
          }

          return true;
        });
      }

      // Apply sorting
      if (sortField) {
        filteredData.sort((a, b) => {
          let aVal: any, bVal: any;

          // Handle nested transaction fields
          if (sortField.startsWith('transaction.')) {
            const field = sortField.split('.')[1];
            aVal = a.transaction?.[field as keyof typeof a.transaction];
            bVal = b.transaction?.[field as keyof typeof b.transaction];
          } else {
            aVal = a[sortField as keyof typeof a];
            bVal = b[sortField as keyof typeof b];
          }

          // Handle null/undefined values
          if (aVal === null || aVal === undefined) return sortDirection === 'asc' ? 1 : -1;
          if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? -1 : 1;

          // String comparison
          if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortDirection === 'asc'
              ? aVal.localeCompare(bVal)
              : bVal.localeCompare(aVal);
          }

          // Number/Date comparison
          return sortDirection === 'asc'
            ? aVal > bVal ? 1 : -1
            : aVal < bVal ? 1 : -1;
        });
      }

      setDisputes(filteredData);
    } catch (error) {
      console.error("Error loading disputes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        // Third click: reset to default (no sorting)
        setSortField(null);
        setSortDirection('asc');
      }
    } else {
      // New field, default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="h-4 w-4" />
      : <ArrowDown className="h-4 w-4" />;
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      started: "Started",
      transaction_selected: "Transaction selected",
      eligibility_checked: "Eligibility checked",
      reason_selected: "Reason selected",
      documents_uploaded: "Documents uploaded",
      under_review: "Chargeback filing in progress...",
      awaiting_investigation: "Awaiting Investigation",
      chargeback_filed: "Chargeback Filed",
      awaiting_merchant_refund: "Awaiting Merchant Refund",
      awaiting_settlement: "Awaiting Settlement",
      pending_manual_review: "Pending Manual Review",
      approved: "Approved",
      completed: "Completed",
      rejected: "Rejected",
      cancelled: "Cancelled",
      expired: "Expired",
      requires_action: "Requires action",
      ineligible: "Ineligible",
      closed_lost: "Closed - Lost",
      representment_contested: "Representment Contested"
    };
    return statusMap[status] || status;
  };

  // Derive a display status from logs and flags
  const getDerivedStatus = (dispute: Dispute): string => {
    const actions = dispute.chargeback_actions || [];
    const repStatus = (dispute.transaction as any)?.chargeback_representment_static?.representment_status;

    // Check representment status first (most recent activity)
    if (repStatus === 'accepted_by_bank') return "Representment Accepted - Merchant Wins";
    if (repStatus === 'rejected_by_bank') return "Representment Rejected - Customer Wins";
    if (repStatus === 'pending') return "Merchant Representment Received";
    if (repStatus === 'awaiting_customer_info') return "Waiting for Customer Response";

    if (actions.some(a => a.awaiting_merchant_refund)) return "Awaiting Merchant Refund";
    if (actions.some(a => a.awaiting_settlement)) return "Awaiting Settlement";
    if (actions.some(a => a.requires_manual_review)) return "Pending Manual Review";

    return getStatusLabel(dispute.status);
  };

  // Get the color for the status square
  const getStatusColor = (dispute: Dispute): string => {
    const status = dispute.status;
    const repStatus = (dispute.transaction as any)?.chargeback_representment_static?.representment_status;

    // Needs attention (orange)
    if (repStatus === 'pending' || ['requires_action', 'pending_manual_review', 'awaiting_settlement'].includes(status)) {
      return 'text-[#ff8c00] fill-[#ff8c00]';
    }

    // Void (gray)
    if (['rejected', 'cancelled', 'expired'].includes(status)) {
      return 'text-gray-400 fill-gray-400';
    }

    // Done (green)
    if (repStatus === 'no_representment' || repStatus === 'accepted_by_bank' || 
        ['approved', 'completed', 'ineligible', 'closed_lost', 'representment_contested'].includes(status) ||
        dispute.transaction?.dispute_status === 'closed_won' || 
        dispute.transaction?.dispute_status === 'closed_lost') {
      return 'text-[#22c55e] fill-[#22c55e]';
    }

    // In progress (blue) - default
    return 'text-[#4169e1] fill-[#4169e1]';
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
        <DisputeDetail 
          dispute={selectedDispute} 
          onUpdate={() => {
            loadDisputes();
            setSelectedDispute(null);
          }}
        />
      </div>
    );
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading disputes...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-t">
              <TableHead className="w-12"></TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Current Status</span>
                  {getSortIcon('status')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.acquirer_name')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Acquirer Name</span>
                  {getSortIcon('transaction.acquirer_name')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.merchant_category_code')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Merchant Category Code</span>
                  {getSortIcon('transaction.merchant_category_code')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.merchant_id')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Merchant ID</span>
                  {getSortIcon('transaction.merchant_id')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.merchant_name')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Merchant Name</span>
                  {getSortIcon('transaction.merchant_name')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.transaction_id')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Reference Number</span>
                  {getSortIcon('transaction.transaction_id')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction_id')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Tid</span>
                  {getSortIcon('transaction_id')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.transaction_amount')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Transaction Amount</span>
                  {getSortIcon('transaction.transaction_amount')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.transaction_currency')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Transaction Currency</span>
                  {getSortIcon('transaction.transaction_currency')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.transaction_time')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Transaction Time</span>
                  {getSortIcon('transaction.transaction_time')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.refund_amount')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Refund Amount</span>
                  {getSortIcon('transaction.refund_amount')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.refund_received')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Refund Received</span>
                  {getSortIcon('transaction.refund_received')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.settled')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Settled</span>
                  {getSortIcon('transaction.settled')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.settlement_date')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Settlement Date</span>
                  {getSortIcon('transaction.settlement_date')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.local_transaction_amount')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Local Amount</span>
                  {getSortIcon('transaction.local_transaction_amount')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/30 transition-colors text-muted-foreground font-normal"
                onClick={() => handleSort('transaction.local_transaction_currency')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>Local Currency</span>
                  {getSortIcon('transaction.local_transaction_currency')}
                </div>
              </TableHead>
              <TableHead className="whitespace-nowrap text-muted-foreground font-normal">
                <div className="flex items-center gap-2">
                  <span>Action Type</span>
                </div>
              </TableHead>
              <TableHead className="whitespace-nowrap text-muted-foreground font-normal">
                <div className="flex items-center gap-2">
                  <span>Admin Message</span>
                </div>
              </TableHead>
              <TableHead className="whitespace-nowrap text-muted-foreground font-normal">
                <div className="flex items-center gap-2">
                  <span>Temp Credit</span>
                </div>
              </TableHead>
              <TableHead className="whitespace-nowrap text-muted-foreground font-normal">
                <div className="flex items-center gap-2">
                  <span>Chargeback Filed</span>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {disputes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={21} className="h-64">
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
                  className="cursor-pointer hover:bg-muted/20 border-b"
                  onClick={() => {
                    if (onDisputeSelect) {
                      onDisputeSelect({
                        id: dispute.id,
                        transactionId: dispute.transaction_id,
                        status: dispute.status
                      });
                    } else {
                      setSelectedDispute(dispute);
                    }
                  }}
                >
                  <TableCell>
                    <Square className={`h-3 w-3 ${getStatusColor(dispute)}`} />
                  </TableCell>
                  <TableCell className="font-normal">
                    {getDerivedStatus(dispute)}
                  </TableCell>
                  <TableCell>{dispute.transaction?.acquirer_name ?? "-"}</TableCell>
                  <TableCell>{dispute.transaction?.merchant_category_code ?? "-"}</TableCell>
                  <TableCell>{dispute.transaction?.merchant_id ?? "-"}</TableCell>
                  <TableCell>{dispute.transaction?.merchant_name ?? "-"}</TableCell>
                  <TableCell>{dispute.transaction?.transaction_id ?? "-"}</TableCell>
                  <TableCell>{dispute.transaction_id ? dispute.transaction_id.toString().slice(-6) : "-"}</TableCell>
                  <TableCell>{dispute.transaction?.transaction_amount ?? "-"}</TableCell>
                  <TableCell>{dispute.transaction?.transaction_currency ?? "-"}</TableCell>
                  <TableCell>
                    {dispute.transaction?.transaction_time
                      ? format(new Date(dispute.transaction.transaction_time), "MMM dd, yyyy HH:mm")
                      : "-"}
                  </TableCell>
                  <TableCell>{dispute.transaction?.refund_amount ?? "-"}</TableCell>
                  <TableCell>{dispute.transaction?.refund_received ? "Yes" : "No"}</TableCell>
                  <TableCell>{dispute.transaction?.settled ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    {dispute.transaction?.settlement_date
                      ? format(new Date(dispute.transaction.settlement_date), "MMM dd, yyyy")
                      : "-"}
                  </TableCell>
                  <TableCell>{dispute.transaction?.local_transaction_amount ?? "-"}</TableCell>
                  <TableCell>{dispute.transaction?.local_transaction_currency ?? "-"}</TableCell>
                  <TableCell>
                    {dispute.chargeback_actions && dispute.chargeback_actions.length > 0
                      ? dispute.chargeback_actions[0].action_type.replace(/_/g, ' ')
                      : "-"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate" title={dispute.chargeback_actions?.[0]?.admin_message}>
                    {dispute.chargeback_actions && dispute.chargeback_actions.length > 0
                      ? dispute.chargeback_actions[0].admin_message
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {dispute.chargeback_actions && dispute.chargeback_actions.length > 0
                      ? (dispute.chargeback_actions[0].temporary_credit_issued ? "✓ Yes" : "✗ No")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {dispute.chargeback_actions && dispute.chargeback_actions.length > 0
                      ? (dispute.chargeback_actions[0].chargeback_filed ? "✓ Yes" : "✗ No")
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
