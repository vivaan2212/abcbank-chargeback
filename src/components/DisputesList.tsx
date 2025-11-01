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
  status: string;
  created_at: string;
  updated_at: string;
  reason_label: string | null;
  reason_id: string | null;
  custom_reason: string | null;
  eligibility_status: string | null;
  eligibility_reasons: string[] | null;
  documents: any;
  order_details: string | null;
  customer_id: string;
  conversation_id: string | null;
  transaction_id: string | null;
  latestActionLog?: string | null;
  transaction?: {
    id?: string;
    transaction_id?: number;
    merchant_name?: string;
    merchant_category_code?: number;
    transaction_amount?: number;
    transaction_currency?: string;
    local_transaction_amount?: number;
    local_transaction_currency?: string;
    transaction_time?: string;
    acquirer_name?: string;
    pos_entry_mode?: number;
    secured_indication?: number;
    is_wallet_transaction?: boolean;
    wallet_type?: string | null;
    merchant_id?: number;
    customer_id?: string;
    created_at?: string;
    refund_received?: boolean;
    refund_amount?: number;
    settled?: boolean;
    settlement_date?: string | null;
    temporary_credit_provided?: boolean | null;
    temporary_credit_amount?: number | null;
    temporary_credit_currency?: string | null;
    temporary_credit_reversal_at?: string | null;
    needs_attention?: boolean | null;
    dispute_status?: string | null;
    chargeback_case_id?: string | null;
    chargeback_representment_static?: {
      id: string;
      transaction_id: string;
      will_be_represented: boolean;
      representment_status: string;
      merchant_reason_text: string | null;
      merchant_document_url: string | null;
      source: string | null;
      created_at: string;
      updated_at: string;
    }[] | {
      id: string;
      transaction_id?: string;
      will_be_represented: boolean;
      representment_status: string;
      merchant_reason_text: string | null;
      merchant_document_url: string | null;
      source: string | null;
      created_at?: string;
      updated_at?: string;
    };
  };
  chargeback_actions?: Array<{
    id: string;
    dispute_id?: string;
    action_type: string;
    admin_message: string;
    chargeback_filed: boolean;
    awaiting_settlement: boolean;
    days_since_settlement: number | null;
    awaiting_merchant_refund: boolean;
    temporary_credit_issued?: boolean;
    requires_manual_review?: boolean;
    net_amount?: number;
    days_since_transaction?: number;
    is_secured_otp?: boolean;
    is_unsecured?: boolean;
    merchant_category_code?: number;
    is_restricted_mcc?: boolean;
    is_facebook_meta?: boolean;
    created_at: string;
    updated_at: string;
  }>;
  dispute_decisions?: Array<{
    id: string;
    decision: string;
    reason_summary: string;
    created_at: string;
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

    // Subscribe to dispute decision changes
    const decisionsChannel = supabase
      .channel('dispute-decisions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dispute_decisions',
        },
        (payload) => {
          console.log('Dispute decision change detected:', payload);
          loadDisputes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(disputesChannel);
      supabase.removeChannel(repChannel);
      supabase.removeChannel(decisionsChannel);
    };
  }, [statusFilter, userId, filters, sortField, sortDirection]);

  const loadDisputes = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from("disputes")
        .select("*")
        .order("updated_at", { ascending: false });
      
      // Only filter by customer_id if userId is provided (customer view)
      if (userId) {
        query = query.eq("customer_id", userId);
      }

      // Filter by status category (only where safe to do server-side)
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
      } else if (statusFilter === "void") {
        query = query.in("status", ["rejected", "cancelled", "expired"]);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Gather IDs for related lookups
      const disputeIds = (data || []).map((d: any) => d.id);
      const transactionIds = (data || [])
        .map((d: any) => d.transaction_id)
        .filter((id: string | null): id is string => !!id);

      // Fetch related records in parallel (no implicit joins required)
      const [
        txnsRes,
        repsRes,
        actionsRes,
        decisionsRes,
        actionLogsRes
      ] = await Promise.all([
        transactionIds.length > 0
          ? supabase
              .from("transactions")
              .select(
                "id, transaction_id, transaction_time, transaction_amount, transaction_currency, merchant_name, merchant_id, merchant_category_code, acquirer_name, refund_amount, refund_received, settled, settlement_date, local_transaction_amount, local_transaction_currency, is_wallet_transaction, wallet_type, pos_entry_mode, secured_indication, dispute_status, needs_attention, temporary_credit_provided, temporary_credit_amount, temporary_credit_currency, chargeback_case_id"
              )
              .in("id", transactionIds)
          : Promise.resolve({ data: [], error: null }),
        transactionIds.length > 0
          ? supabase
              .from("chargeback_representment_static")
              .select(
                "id, transaction_id, will_be_represented, representment_status, merchant_document_url, merchant_reason_text, source, created_at, updated_at"
              )
              .in("transaction_id", transactionIds)
          : Promise.resolve({ data: [], error: null }),
        disputeIds.length > 0
          ? supabase
              .from("chargeback_actions")
              .select(
                "id, dispute_id, action_type, admin_message, temporary_credit_issued, chargeback_filed, awaiting_settlement, awaiting_merchant_refund, requires_manual_review, net_amount, days_since_transaction, days_since_settlement, is_secured_otp, is_unsecured, merchant_category_code, is_restricted_mcc, is_facebook_meta, created_at, updated_at"
              )
              .in("dispute_id", disputeIds)
          : Promise.resolve({ data: [], error: null }),
        disputeIds.length > 0
          ? supabase
              .from("dispute_decisions")
              .select("dispute_id, decision, created_at")
              .in("dispute_id", disputeIds)
          : Promise.resolve({ data: [], error: null }),
        transactionIds.length > 0
          ? supabase
              .from("dispute_action_log")
              .select("transaction_id, action, performed_at")
              .in("transaction_id", transactionIds)
              .order('performed_at', { ascending: false })
          : Promise.resolve({ data: [], error: null })
      ]);

      // Build maps for quick attachment
      const txMap: Record<string, any> = {};
      (txnsRes.data || []).forEach((t: any) => (txMap[t.id] = t));

      const repByTxn: Record<string, any[]> = {};
      (repsRes.data || []).forEach((r: any) => {
        if (!repByTxn[r.transaction_id]) repByTxn[r.transaction_id] = [];
        repByTxn[r.transaction_id].push(r);
      });

      const actionsByDispute: Record<string, any[]> = {};
      (actionsRes.data || []).forEach((a: any) => {
        if (!actionsByDispute[a.dispute_id]) actionsByDispute[a.dispute_id] = [];
        actionsByDispute[a.dispute_id].push(a);
      });

      const decisionsMap: Record<string, any[]> = {};
      (decisionsRes.data || []).forEach((d: any) => {
        if (!decisionsMap[d.dispute_id]) decisionsMap[d.dispute_id] = [];
        decisionsMap[d.dispute_id].push({ decision: d.decision, created_at: d.created_at });
      });

      // Build map for latest action log per transaction
      const latestActionByTxn: Record<string, string> = {};
      (actionLogsRes.data || []).forEach((log: any) => {
        // Only keep the first (most recent) entry for each transaction_id
        if (!latestActionByTxn[log.transaction_id]) {
          latestActionByTxn[log.transaction_id] = log.action;
        }
      });

      // Attach related data
      const dataWithRelations = (data || []).map((dispute: any) => {
        const txn = dispute.transaction_id ? txMap[dispute.transaction_id] : undefined;
        const rep = dispute.transaction_id ? repByTxn[dispute.transaction_id] : undefined;
        const latestAction = dispute.transaction_id ? latestActionByTxn[dispute.transaction_id] : undefined;
        return {
          ...dispute,
          transaction: txn ? { ...txn, chargeback_representment_static: rep?.length === 1 ? rep[0] : (rep || []) } : undefined,
          chargeback_actions: actionsByDispute[dispute.id] || [],
          dispute_decisions: decisionsMap[dispute.id] || [],
          latestActionLog: latestAction || null
        } as Dispute;
      });

      // Only show disputes on dashboard after transaction selection
      let filteredData = dataWithRelations.filter((d: any) => d.transaction_id !== null);

      // Special handling for needs_attention
      if (statusFilter === 'needs_attention') {
        filteredData = filteredData.filter((dispute: any) => {
          // Exclude terminal "done" states from needs attention regardless of flags
          const terminalDoneStatuses = ['done','completed','approved','ineligible','closed_lost','closed_won','representment_contested','write_off_approved'];
          if (terminalDoneStatuses.includes(dispute.status)) return false;

          // Exclude write-off approved disputes from needs attention
          const hasWriteOffDecision = dispute.dispute_decisions?.some((d: any) => d.decision === 'APPROVE_WRITEOFF');
          if (hasWriteOffDecision) return false;
          if (dispute.status === 'write_off_approved') return false;
          
          // Exclude in_progress cases from needs attention
          if (dispute.status === 'in_progress') return false;
          
          const txn = dispute.transaction;
          const repRel = (txn as any)?.chargeback_representment_static;
          const repStatus = Array.isArray(repRel) ? repRel[0]?.representment_status : repRel?.representment_status;

          // Exclude if representment or transaction is terminal
          if (repStatus === 'no_representment' || 
              repStatus === 'accepted_by_bank' || 
              repStatus === 'customer_evidence_rejected' ||
              txn?.dispute_status === 'closed_won' || 
              txn?.dispute_status === 'closed_lost' ||
              txn?.dispute_status === 'merchant_won') {
            return false;
          }
          
          // Show in needs_attention if pending representment, awaiting customer info, customer evidence submitted,
          // explicit transaction needs_attention, or dispute requires manual action
          return repStatus === 'pending' || 
                 repStatus === 'awaiting_customer_info' ||
                 txn?.dispute_status === 'evidence_submitted' ||
                 txn?.needs_attention === true ||
                 ['requires_action', 'pending_manual_review', 'awaiting_settlement'].includes(dispute.status);
        });
      }

      // Special handling for awaiting_customer filter
      if (statusFilter === 'awaiting_customer') {
        filteredData = filteredData.filter((dispute: any) => {
          const repRel = (dispute.transaction as any)?.chargeback_representment_static;
          const repStatus = Array.isArray(repRel) ? repRel[0]?.representment_status : repRel?.representment_status;
          return repStatus === 'awaiting_customer_info';
        });
      }

      // Special handling for done
      if (statusFilter === 'done') {
        filteredData = filteredData.filter((dispute: any) => {
          // Include write-off approved disputes in done
          const hasWriteOffDecision = dispute.dispute_decisions?.some((d: any) => d.decision === 'APPROVE_WRITEOFF');
          if (hasWriteOffDecision) return true;
          if (dispute.status === 'write_off_approved') return true;
          
          // Include disputes with done statuses
          if ([
            'done', 'completed', 'approved', 'ineligible', 'closed_lost', 'closed_won', 
            'representment_contested', 'write_off_approved'
          ].includes(dispute.status)) return true;
          
          const repRel = (dispute.transaction as any)?.chargeback_representment_static;
          const repStatus = Array.isArray(repRel) ? repRel[0]?.representment_status : repRel?.representment_status;
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
      representment_contested: "Representment Contested",
      write_off_approved: "Write-off provided to customer"
    };
    return statusMap[status] || status;
  };

  // Build activity timeline and get the most recent activity label (matches ActivityLogView)
  const getDerivedStatus = (dispute: Dispute): string => {
    // Use the latest action log if available
    if (dispute.latestActionLog) {
      return dispute.latestActionLog;
    }

    // Fallback: Build activity timeline similar to ActivityLogView
    const activityList: Array<{id: string; timestamp: string; label: string; order: number}> = [];
    
    const stagePriorityMap: Record<string, number> = {
      'milestone-received': 1,
      'milestone-security': 2,
      'milestone-eligibility': 3,
      'milestone-docs-requested': 4,
      'milestone-docs-uploaded': 5,
      'milestone-reason': 6,
      'action-temp-credit': 7,
      'action-awaiting-refund': 8,
      'action-manual-review': 9,
      'action-reviewed': 10,
      'action-filed': 11,
      'milestone-final-status': 12,
      'representment-status': 20,
      'rep-evidence-reviewed': 21,
      'rep-chargeback-recalled': 22,
      'rep-credit-reversed': 23,
      'customer-evidence-submitted': 24,
      'write-off': 90
    };

    const getStageOrder = (id: string): number => {
      if (stagePriorityMap[id]) return stagePriorityMap[id];
      for (const [key, priority] of Object.entries(stagePriorityMap)) {
        if (id.startsWith(key)) return priority;
      }
      return 999;
    };

    // 1. Dispute received
    activityList.push({
      id: 'milestone-received',
      timestamp: dispute.created_at,
      label: 'Received a disputed transaction',
      order: getStageOrder('milestone-received')
    });

    // 2. Security analysis
    if (dispute.transaction) {
      const isSecured = dispute.transaction.secured_indication === 1;
      activityList.push({
        id: 'milestone-security',
        timestamp: dispute.created_at,
        label: isSecured ? 'Transaction is secured' : 'Transaction is unsecured',
        order: getStageOrder('milestone-security')
      });
    }

    // 3. Eligibility check
    if (dispute.eligibility_status) {
      const isEligible = dispute.eligibility_status.toUpperCase() === 'ELIGIBLE';
      activityList.push({
        id: 'milestone-eligibility',
        timestamp: dispute.updated_at,
        label: isEligible ? 'Transaction is eligible for chargeback' : 'Transaction is not eligible for chargeback',
        order: getStageOrder('milestone-eligibility')
      });
    }

    // 4. Document upload
    if (dispute.documents && Array.isArray(dispute.documents) && dispute.documents.length > 0) {
      activityList.push({
        id: 'milestone-docs-uploaded',
        timestamp: dispute.updated_at,
        label: `Customer uploaded ${dispute.documents.length} document${dispute.documents.length > 1 ? 's' : ''}`,
        order: getStageOrder('milestone-docs-uploaded')
      });
    }

    // 5. Reason selection
    if (dispute.reason_label || dispute.custom_reason) {
      activityList.push({
        id: 'milestone-reason',
        timestamp: dispute.updated_at,
        label: `Dispute reason: ${dispute.reason_label || dispute.custom_reason}`,
        order: getStageOrder('milestone-reason')
      });
    }

    // 6. Chargeback actions
    const actions = dispute.chargeback_actions || [];
    actions.forEach((action, idx) => {
      if (action.temporary_credit_issued) {
        activityList.push({
          id: `action-${idx}-temp-credit`,
          timestamp: action.updated_at || action.created_at,
          label: 'Temporary credit approved',
          order: getStageOrder('action-temp-credit')
        });
      }
      if (action.awaiting_merchant_refund) {
        activityList.push({
          id: `action-${idx}-awaiting-refund`,
          timestamp: action.updated_at || action.created_at,
          label: 'Awaiting merchant refund',
          order: getStageOrder('action-awaiting-refund')
        });
      }
      if (action.requires_manual_review) {
        activityList.push({
          id: `action-${idx}-manual-review`,
          timestamp: action.updated_at || action.created_at,
          label: 'Case requires manual review',
          order: getStageOrder('action-manual-review')
        });
      }
      if (action.chargeback_filed) {
        activityList.push({
          id: `action-${idx}-filed`,
          timestamp: action.updated_at || action.created_at,
          label: 'Chargeback filing completed',
          order: getStageOrder('action-filed')
        });
      }
    });

    // 7. Write-off decision
    const latestDecision = dispute.dispute_decisions?.[0];
    if (latestDecision?.decision === 'APPROVE_WRITEOFF') {
      activityList.push({
        id: 'write-off',
        timestamp: latestDecision.created_at,
        label: 'Write-off provided to customer',
        order: getStageOrder('write-off')
      });
    }

    // 8. Final status
    const status = dispute.status?.toLowerCase() || '';
    const finalStatuses = ['completed', 'approved', 'rejected', 'void', 'cancelled', 'closed_won', 'closed_lost'];
    if (finalStatuses.includes(status)) {
      let label = '';
      switch (status) {
        case 'completed':
        case 'approved':
        case 'closed_won':
          label = 'Chargeback approved - Case resolved';
          break;
        case 'rejected':
          label = 'Chargeback rejected';
          break;
        case 'void':
        case 'cancelled':
          label = 'Case voided';
          break;
      }
      if (label) {
        activityList.push({
          id: 'milestone-final-status',
          timestamp: dispute.updated_at,
          label,
          order: getStageOrder('milestone-final-status')
        });
      }
    }

    // 9. Representment status (highest priority after chargeback filed)
    const repData = (dispute.transaction as any)?.chargeback_representment_static;
    const repStatus = Array.isArray(repData) ? repData[0]?.representment_status : repData?.representment_status;
    const hasChargebackAction = actions.length > 0;
    const chargebackFiledOrApproved = hasChargebackAction || ['completed', 'approved', 'closed_won'].includes(status);
    
    if (repData && chargebackFiledOrApproved) {
      const repTs = repData.updated_at || dispute.updated_at;
      
      if (repStatus === 'accepted_by_bank') {
        // Add the three bank decision activities
        activityList.push({
          id: 'rep-evidence-reviewed',
          timestamp: repTs,
          label: 'Evidence reviewed and found valid; customer chargeback request to be recalled',
          order: getStageOrder('rep-evidence-reviewed')
        });
        activityList.push({
          id: 'rep-chargeback-recalled',
          timestamp: repTs,
          label: `Chargeback request has been recalled`,
          order: getStageOrder('rep-chargeback-recalled')
        });
        activityList.push({
          id: 'rep-credit-reversed',
          timestamp: repTs,
          label: 'Temporary credit has been reversed',
          order: getStageOrder('rep-credit-reversed')
        });
      } else if (repStatus === 'rejected_by_bank') {
        activityList.push({
          id: 'representment-status',
          timestamp: repTs,
          label: 'Representment Rejected - Customer Wins',
          order: getStageOrder('representment-status')
        });
      } else if (repStatus === 'pending') {
        activityList.push({
          id: 'representment-status',
          timestamp: repTs,
          label: 'Merchant Representment Received',
          order: getStageOrder('representment-status')
        });
      } else if (repStatus === 'awaiting_customer_info') {
        activityList.push({
          id: 'representment-status',
          timestamp: repTs,
          label: 'Waiting for Customer Response',
          order: getStageOrder('representment-status')
        });
      } else if (repStatus === 'no_representment') {
        activityList.push({
          id: 'representment-status',
          timestamp: repTs,
          label: 'Merchant Representment Period Closed',
          order: getStageOrder('representment-status')
        });
      }
    }

    // Sort activities by stage order first, then by timestamp
    activityList.sort((a, b) => {
      const orderDiff = a.order - b.order;
      if (orderDiff !== 0) return orderDiff;
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    // Return the label of the most recent activity
    if (activityList.length > 0) {
      return activityList[activityList.length - 1].label;
    }

    // Fallback to basic status label
    return getStatusLabel(dispute.status);
  };

  // Get the color for the status square based on current tab filter
  const getStatusColor = (dispute: Dispute): string => {
    // For needs_attention tab, still use orange even if representment is pending
    if (statusFilter === 'needs_attention') {
      return 'text-[#ff8c00] fill-[#ff8c00]'; // Orange
    }
    
    // For other tabs, use the tab color
    if (statusFilter === 'void') {
      return 'text-gray-400 fill-gray-400'; // Gray
    } else if (statusFilter === 'done') {
      return 'text-[#22c55e] fill-[#22c55e]'; // Green
    } else {
      return 'text-[#4169e1] fill-[#4169e1]'; // Blue (in progress)
    }
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
