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
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
  documents: any;
  eligibility_reasons: string[] | null;
  created_at: string;
  updated_at: string;
  transaction?: {
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
  };
}

interface DisputesListProps {
  statusFilter: string;
  userId?: string;
  filters?: DisputeFiltersType;
}

const DisputesList = ({ statusFilter, userId, filters }: DisputesListProps) => {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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
  }, [statusFilter, userId, filters, sortField, sortDirection]);

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
            secured_indication
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
        query = query.in("status", ["approved", "completed", "ineligible"]);
      } else if (statusFilter === "needs_attention") {
        query = query.in("status", ["requires_action"]);
      } else if (statusFilter === "void") {
        query = query.in("status", ["rejected", "cancelled"]);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Store all disputes permanently - no filtering by transaction_id
      let filteredData = data || [];

      // Apply additional filters from filter panel
      if (filters) {
        filteredData = filteredData.filter((dispute) => {
          // Current Status
          if (filters.currentStatus && dispute.status !== filters.currentStatus) return false;

          // Transaction fields
          const txn = dispute.transaction;
          if (!txn) return false;

          // Acquirer Name
          if (filters.acquirerName && !txn.acquirer_name?.toLowerCase().includes(filters.acquirerName.toLowerCase())) return false;

          // Merchant Category Code
          if (filters.merchantCategoryCode && !txn.merchant_category_code?.toString().includes(filters.merchantCategoryCode)) return false;

          // Merchant ID
          if (filters.merchantId && !txn.merchant_id?.toString().includes(filters.merchantId)) return false;

          // Merchant Name
          if (filters.merchantName && !txn.merchant_name?.toLowerCase().includes(filters.merchantName.toLowerCase())) return false;

          // Reference Number (transaction_id)
          if (filters.referenceNumber && !txn.transaction_id?.toString().includes(filters.referenceNumber)) return false;

          // Tid
          if (filters.tid && !dispute.transaction_id?.toString().includes(filters.tid)) return false;

          // Transaction Amount Range
          if (filters.transactionAmountMin !== undefined && txn.transaction_amount !== undefined && txn.transaction_amount < filters.transactionAmountMin) return false;
          if (filters.transactionAmountMax !== undefined && txn.transaction_amount !== undefined && txn.transaction_amount > filters.transactionAmountMax) return false;

          // Transaction Currency
          if (filters.transactionCurrency && txn.transaction_currency !== filters.transactionCurrency) return false;

          // Transaction Time Range
          if (filters.transactionTimeFrom && txn.transaction_time) {
            const txnDate = new Date(txn.transaction_time);
            const fromDate = new Date(filters.transactionTimeFrom);
            if (txnDate < fromDate) return false;
          }
          if (filters.transactionTimeTo && txn.transaction_time) {
            const txnDate = new Date(txn.transaction_time);
            const toDate = new Date(filters.transactionTimeTo);
            toDate.setHours(23, 59, 59, 999);
            if (txnDate > toDate) return false;
          }

          // Refund Amount Range
          if (filters.refundAmountMin !== undefined && txn.refund_amount !== undefined && txn.refund_amount < filters.refundAmountMin) return false;
          if (filters.refundAmountMax !== undefined && txn.refund_amount !== undefined && txn.refund_amount > filters.refundAmountMax) return false;

          // Refund Received
          if (filters.refundReceived === 'yes' && !txn.refund_received) return false;
          if (filters.refundReceived === 'no' && txn.refund_received) return false;

          // Settled
          if (filters.settled === 'yes' && !txn.settled) return false;
          if (filters.settled === 'no' && txn.settled) return false;

          // Settlement Date Range
          if (filters.settlementDateFrom && txn.settlement_date) {
            const settlementDate = new Date(txn.settlement_date);
            const fromDate = new Date(filters.settlementDateFrom);
            if (settlementDate < fromDate) return false;
          }
          if (filters.settlementDateTo && txn.settlement_date) {
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
      approved: "Approved",
      completed: "Completed",
      rejected: "Rejected",
      cancelled: "Cancelled",
      requires_action: "Requires action",
      ineligible: "Ineligible"
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
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Current Status</span>
                  {getSortIcon('status')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.acquirer_name')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Acquirer Name</span>
                  {getSortIcon('transaction.acquirer_name')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.merchant_category_code')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Merchant Category Code</span>
                  {getSortIcon('transaction.merchant_category_code')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.merchant_id')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Merchant ID</span>
                  {getSortIcon('transaction.merchant_id')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.merchant_name')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Merchant Name</span>
                  {getSortIcon('transaction.merchant_name')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.transaction_id')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Reference Number</span>
                  {getSortIcon('transaction.transaction_id')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction_id')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Tid</span>
                  {getSortIcon('transaction_id')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.transaction_amount')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Transaction Amount</span>
                  {getSortIcon('transaction.transaction_amount')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.transaction_currency')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Transaction Currency</span>
                  {getSortIcon('transaction.transaction_currency')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.transaction_time')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Transaction Time</span>
                  {getSortIcon('transaction.transaction_time')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.refund_amount')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Refund Amount</span>
                  {getSortIcon('transaction.refund_amount')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.refund_received')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Refund Received</span>
                  {getSortIcon('transaction.refund_received')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.settled')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Settled</span>
                  {getSortIcon('transaction.settled')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.settlement_date')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Settlement Date</span>
                  {getSortIcon('transaction.settlement_date')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.local_transaction_amount')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Local Amount</span>
                  {getSortIcon('transaction.local_transaction_amount')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => handleSort('transaction.local_transaction_currency')}
              >
                <div className="flex items-center justify-between whitespace-nowrap">
                  <span>Local Currency</span>
                  {getSortIcon('transaction.local_transaction_currency')}
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {disputes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={16} className="h-64">
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
