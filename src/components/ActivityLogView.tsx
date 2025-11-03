import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, Database, BookOpen, Share2, PanelLeft, ArrowUp, Check, X, Layers, FileText } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import DashboardSidebar from "./DashboardSidebar";
import { Input } from "@/components/ui/input";
import { PreviewPane } from "./PreviewPane";
import KnowledgeBasePanel from "./KnowledgeBasePanel";
import { useToast } from "@/hooks/use-toast";
import paceAvatar from "@/assets/pace-logo-grey.png";
import videoIcon from "@/assets/video-icon.png";

// Stage priority map for enforcing activity order
const stagePriorityMap: Record<string, number> = {
  'milestone-received': 1,
  'milestone-security': 2,
  'milestone-eligibility': 3,
  'milestone-docs-requested': 4,
  'milestone-docs-uploaded': 5,
  'milestone-reason': 6,
  // Chargeback actions
  'action-temp-credit': 7,
  'action-awaiting-refund': 8,
  'action-manual-review': 9,
  'action-reviewed': 10,
  'action-filed': 11,
  // Final closure stages (before representment)
  'milestone-final-status': 12,
  // Network representment flow
  'representment-status': 20,
  'rep-evidence-reviewed': 21,
  'rep-chargeback-recalled': 22,
  'rep-credit-reversed': 23,
  'customer-evidence-submitted': 24,
  'rebuttal-submitted': 25,
  'rebuttal-accepted': 26,
  'chargeback-recalled': 27,
  'case-resolved-merchant-accepted': 28,
  // Write-off
  'write-off': 90
};

// Helper to normalize action IDs by stripping numeric indices
const normalizeStageId = (id: string): string => {
  // Strip patterns like "action-0-filed" to "action-filed"
  return id.replace(/^action-\d+-/, 'action-');
};

// Helper to extract stage order from activity ID
const getStageOrder = (id: string): number => {
  const normalized = normalizeStageId(id);
  
  // Direct match
  if (stagePriorityMap[normalized]) return stagePriorityMap[normalized];
  
  // Check for prefixes like "action-temp-credit" or "write-off-timestamp"
  for (const [key, priority] of Object.entries(stagePriorityMap)) {
    if (normalized.startsWith(key)) return priority;
  }
  
  return 999; // Default for unknown stages
};

// Unified comparator: timestamp (oldest first), then stage priority
const compareActivities = (a: Activity, b: Activity) => {
  const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  if (timeDiff !== 0) return timeDiff;
  return getStageOrder(a.id) - getStageOrder(b.id);
};
interface Activity {
  id: string;
  timestamp: string;
  label: string;
  expandable?: boolean;
  expanded?: boolean;
  details?: string;
  attachments?: Array<{
    label: string;
    icon: string;
    action?: string;
    videoData?: any;
    docUrl?: string;
    docData?: any; // Document data for preview
    link?: string;
  }>;
  evidenceDocuments?: Array<{name: string; path: string; size: number; type: string}>;
  reviewer?: string;
  activityType?: 'error' | 'needs_attention' | 'paused' | 'loading' | 'message' | 'success' | 'human_action' | 'done' | 'void' | 'review_decision';
  showRepresentmentActions?: boolean;
  representmentTransactionId?: string;
  showPendingRepresentmentActions?: boolean;
  color?: 'green' | 'blue' | 'orange' | 'yellow';
  tag?: string;
  reasoning?: string[];
  link?: string;
}
interface ActivityLogViewProps {
  disputeId: string;
  transactionId: string | null;
  status: string;
  onBack: () => void;
}
const ActivityLogView = ({
  disputeId,
  transactionId,
  status,
  onBack
}: ActivityLogViewProps) => {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [previewPaneOpen, setPreviewPaneOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<{
    type: "video" | "document";
    url: string;
    cardNetwork?: string;
    extractedFields?: Array<{ label: string; value: string }>;
    title?: string;
  } | null>(null);
  const [isBankAdmin, setIsBankAdmin] = useState(false);
  const [processingRepresentment, setProcessingRepresentment] = useState(false);
  const [isKnowledgeBaseOpen, setIsKnowledgeBaseOpen] = useState(false);
  const [isKnowledgeBaseClosing, setIsKnowledgeBaseClosing] = useState(false);
  const {
    toast
  } = useToast();
  const handleCloseKnowledgeBase = () => {
    setIsKnowledgeBaseClosing(true);
    setTimeout(() => {
      setIsKnowledgeBaseOpen(false);
      setIsKnowledgeBaseClosing(false);
    }, 400); // Match the animation duration
  };
  useEffect(() => {
    loadDisputeData();
  }, [disputeId]);

  // Check if user is bank admin
  useEffect(() => {
    const checkBankAdmin = async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return;
      const {
        data: roles
      } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'bank_admin').maybeSingle();
      setIsBankAdmin(!!roles);
    };
    checkBankAdmin();
  }, []);

  // Reload activities when bank admin status changes
  useEffect(() => {
    if (disputeId) {
      loadDisputeData();
    }
  }, [isBankAdmin]);

  // Realtime updates for dispute status and chargeback actions
  useEffect(() => {
    if (!disputeId) return;
    const channel = supabase.channel(`activity-log-${disputeId}`).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chargeback_actions',
      filter: `dispute_id=eq.${disputeId}`
    }, () => {
      loadDisputeData();
    }).on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'disputes',
      filter: `id=eq.${disputeId}`
    }, () => {
      loadDisputeData();
    }).on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'chargeback_representment_static'
    }, () => {
      loadDisputeData();
    }).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chargeback_actions'
    }, () => {
      loadDisputeData();
    }).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'dispute_customer_evidence'
    }, () => {
      loadDisputeData();
    }).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'dispute_customer_evidence_request'
    }, () => {
      loadDisputeData();
    }).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'customer_evidence_reviews'
    }, () => {
      loadDisputeData();
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [disputeId]);
  const loadDisputeData = async () => {
    setLoading(true);
    try {
      // Load dispute with all related data
      const {
        data: dispute,
        error
      } = await supabase.from('disputes').select(`
          *,
          transaction:transactions(
            *,
            chargeback_representment_static(*)
          ),
          chargeback_actions(
            *,
            video:chargeback_videos(id, card_network, video_path)
          )
        `).eq('id', disputeId).single();
      if (error) throw error;

      // Fetch dispute decisions separately
      const { data: decisions } = await supabase
        .from('dispute_decisions')
        .select('decision, created_at')
        .eq('dispute_id', disputeId);
      
      // Add decisions to dispute object
      (dispute as any).dispute_decisions = decisions || [];

      // Build activities from dispute data - milestone-based approach
      const activityList: Activity[] = [];

      // 1. Dispute received milestone
      activityList.push({
        id: 'milestone-received',
        timestamp: dispute.created_at,
        label: 'Received a disputed transaction',
        attachments: dispute.documents ? [{
          label: 'Disputed transaction',
          icon: 'database'
        }] : undefined,
        activityType: 'human_action'
      });

      // 2. Transaction security analysis milestone
      if (dispute.transaction) {
        const isSecured = dispute.transaction.secured_indication === 1;
        const posEntryMode = String(dispute.transaction.pos_entry_mode || '').padStart(2, '0');
        const walletType = dispute.transaction.wallet_type || 'None';
        activityList.push({
          id: 'milestone-security',
          timestamp: dispute.created_at,
          label: isSecured ? 'Transaction is secured' : 'Transaction is unsecured',
          expandable: true,
          details: `POS entry mode: ${posEntryMode}\nWallet type: ${walletType}\nSecured indication: ${dispute.transaction.secured_indication || 0}`,
          activityType: isSecured ? 'success' : 'needs_attention'
        });
      }

      // 3. Eligibility milestone
      if (dispute.eligibility_status) {
        const isEligible = dispute.eligibility_status.toUpperCase() === 'ELIGIBLE';
        let eligibilityLabel = 'Transaction is eligible for chargeback';
        let eligibilityDetails = '';
        if (!isEligible) {
          eligibilityLabel = 'Transaction is not eligible for chargeback';
        }
        if (dispute.eligibility_reasons && Array.isArray(dispute.eligibility_reasons)) {
          eligibilityDetails = dispute.eligibility_reasons.join('\n');
        }
        activityList.push({
          id: 'milestone-eligibility',
          timestamp: dispute.created_at,
          label: eligibilityLabel,
          expandable: eligibilityDetails ? true : false,
          details: eligibilityDetails,
          activityType: isEligible ? 'success' : 'needs_attention'
        });
      }

      // 4. Document request milestone
      if (dispute.status === 'documents_requested' || dispute.documents) {
        activityList.push({
          id: 'milestone-docs-requested',
          timestamp: dispute.created_at,
          label: 'Documents requested from customer',
          activityType: 'needs_attention'
        });
      }

      // 5. Document upload milestone
      if (dispute.documents) {
        const docsArray = Array.isArray(dispute.documents) ? dispute.documents : [];
        if (docsArray.length > 0) {
          activityList.push({
            id: 'milestone-docs-uploaded',
            timestamp: dispute.updated_at,
            label: `Customer uploaded ${docsArray.length} document${docsArray.length > 1 ? 's' : ''}`,
            attachments: docsArray.map((doc: any, idx: number) => ({
              label: doc.name || `Document ${idx + 1}`,
              icon: 'document',
              action: 'document',
              docUrl: doc.path || doc.url, // Store path for later retrieval
              docData: doc // Store full document data
            })),
            activityType: 'success'
          });
        }
      }

      // 6. Reason selection milestone
      if (dispute.reason_label || dispute.custom_reason) {
        activityList.push({
          id: 'milestone-reason',
          timestamp: dispute.created_at,
          label: `Dispute reason: ${dispute.reason_label || dispute.custom_reason}`,
          expandable: dispute.custom_reason ? true : false,
          details: dispute.custom_reason || undefined,
          activityType: 'human_action'
        });
      }

      // 7. Chargeback action milestones
      if (dispute.chargeback_actions && dispute.chargeback_actions.length > 0) {
        dispute.chargeback_actions.forEach((action: any, idx: number) => {
          // Build reasoning details from action data
          let reasoningDetails = '';
          if (action.requires_manual_review) {
            const reasons: string[] = [];
            if (action.days_since_transaction > 21 && !action.dispute?.transaction?.settled) {
              reasons.push(`The transaction is older than 21 days and is not settled`);
            }
            if (action.is_restricted_mcc) {
              reasons.push(`Merchant category code ${action.merchant_category_code} requires additional review`);
            }
            if (action.is_facebook_meta) {
              reasons.push(`Transaction with high-risk merchant (Facebook/Meta)`);
            }
            if (action.admin_message) {
              reasons.push(action.admin_message);
            }
            reasoningDetails = reasons.join('\n\n');
          }

          // Temporary credit issued milestone
          if (action.temporary_credit_issued) {
            const creditAmount = action.net_amount || dispute.transaction?.transaction_amount || 0;
            activityList.push({
              id: `action-${idx}-temp-credit`,
              timestamp: action.created_at,
              label: `Temporary credit approved`,
              expandable: true,
              details: `Credit amount: $${creditAmount.toLocaleString()}\n\nA temporary credit has been issued to your account while we investigate the dispute. This credit will be made permanent if the chargeback is successful.`,
              activityType: 'done'
            });
          }

          // Merchant refund awaiting milestone (enhanced)
          if (action.awaiting_merchant_refund) {
            const daysSince = action.days_since_transaction || 0;
            const daysRemaining = Math.max(0, 14 - daysSince);
            activityList.push({
              id: `action-${idx}-awaiting-refund`,
              timestamp: action.created_at,
              label: 'Awaiting merchant refund',
              expandable: true,
              details: action.is_facebook_meta ? `Transaction with Facebook/Meta detected. These merchants typically issue refunds within 14 days.\n\nDays elapsed: ${daysSince}\nEstimated days remaining: ${daysRemaining}\n\nWe'll automatically monitor for the refund and update the case accordingly.` : `The merchant has been contacted for a refund. This is often faster than filing a chargeback.\n\nDays elapsed: ${daysSince}\n\nWe'll monitor for the refund and proceed with chargeback filing if no refund is received.`,
              activityType: 'needs_attention'
            });
          }

          // Manual review milestone (enhanced)
          if (action.requires_manual_review) {
            activityList.push({
              id: `action-${idx}-manual-review`,
              timestamp: action.created_at,
              label: 'Case requires manual review',
              expandable: reasoningDetails ? true : false,
              details: reasoningDetails,
              activityType: 'needs_attention'
            });
          }

          // Review status milestone
          if (action.updated_at !== action.created_at) {
            activityList.push({
              id: `action-${idx}-reviewed`,
              timestamp: action.updated_at,
              label: 'Marked as reviewed',
              activityType: 'success'
            });
          }

          // Chargeback filed milestone - only show if dispute is NOT in final approved state
          // (to avoid duplicate "Chargeback filed" and "Chargeback approved" entries)
          const isFinalApproved = ['completed', 'approved', 'closed_won'].includes(dispute.status?.toLowerCase() || '');
          if (action.chargeback_filed && !isFinalApproved) {
            const attachments: Activity['attachments'] = [{
              label: 'View Document',
              icon: 'document',
              action: 'document'
            }];

            // Add video recording if available
            if (action.video) {
              attachments.push({
                label: 'Video Recording',
                icon: 'video',
                action: 'video',
                videoData: action.video
              });
            }
            activityList.push({
              id: `action-${idx}-filed`,
              timestamp: action.updated_at || action.created_at,
              label: `Chargeback filing completed. Ref. no: ${action.id.substring(0, 10)}`,
              attachments,
              activityType: 'done'
            });
          }
        });
      }

      // 8. Final dispute outcome milestones  
      if (dispute.status) {
        const finalStatuses = ['completed', 'approved', 'rejected', 'void', 'cancelled', 'closed_won', 'closed_lost'];
        if (finalStatuses.includes(dispute.status.toLowerCase())) {
          let label = '';
          let activityType: Activity['activityType'] = 'done';
          let details = '';
          let attachments: Activity['attachments'] | undefined = undefined;
          switch (dispute.status.toLowerCase()) {
            case 'completed':
            case 'approved':
            case 'closed_won':
              // Determine card network from transaction's acquirer_name
              let cardNetwork = 'Visa'; // default
              if (dispute.transaction?.acquirer_name) {
                const acquirer = dispute.transaction.acquirer_name.toLowerCase();
                if (acquirer.includes('mastercard') || acquirer.includes('master card')) {
                  cardNetwork = 'Mastercard';
                } else if (acquirer.includes('visa')) {
                  cardNetwork = 'Visa';
                }
              }

              // Get reference number from chargeback action
              const refNumber = dispute.chargeback_actions?.[0]?.id?.substring(0, 10) || 'N/A';
              
              label = `Chargeback filed on ${cardNetwork}, Ref No: ${refNumber}`;
              activityType = 'done';
              const resolvedAmount = dispute.chargeback_actions?.[0]?.net_amount || dispute.transaction?.transaction_amount || 0;
              details = `Chargeback has been filed on the ${cardNetwork} portal.\n\nDisputed amount: $${resolvedAmount.toLocaleString()}`;

              // Add video attachment for approved cases - fetch video based on card network
              attachments = [{
                label: 'View Document',
                icon: 'document',
                action: 'document'
              }];

              // Check if video exists in chargeback_actions
              if (dispute.chargeback_actions && dispute.chargeback_actions.length > 0 && dispute.chargeback_actions[0].video) {
                attachments.push({
                  label: 'Video Recording',
                  icon: 'video',
                  action: 'video',
                  videoData: dispute.chargeback_actions[0].video
                });
              } else {
                // If no chargeback_actions but dispute is approved, fetch video by card network
                // Fetch video from database
                const {
                  data: videoData
                } = await supabase.from('chargeback_videos').select('*').eq('card_network', cardNetwork).eq('is_active', true).single();
                if (videoData) {
                  attachments.push({
                    label: 'Video Recording',
                    icon: 'video',
                    action: 'video',
                    videoData
                  });
                }
              }
              break;
            case 'rejected':
              label = 'Chargeback rejected';
              activityType = 'error';
              const action = dispute.chargeback_actions?.[0];
              details = action?.admin_message || 'The chargeback was not approved by the card network. This may be due to insufficient evidence or the transaction being outside the dispute window.\n\nIf you have additional evidence, you may be able to file a new dispute.';
              break;
            case 'void':
            case 'cancelled':
              label = 'Case voided';
              activityType = 'void';
              details = 'This dispute case has been voided or cancelled. This may happen if a merchant refund was received or if the dispute was withdrawn.';
              break;
          }
          if (label) {
            activityList.push({
              id: 'milestone-final-status',
              timestamp: dispute.updated_at,
              label,
              expandable: true,
              details,
              attachments,
              activityType
            });
          }
        }
      }

      // Check if customer evidence exists for this transaction (needed for representment logic)
      let customerEvidence = null;
      if (transactionId) {
        const { data: evidenceData } = await supabase
          .from('dispute_customer_evidence')
          .select('*')
          .eq('transaction_id', transactionId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        customerEvidence = evidenceData;
      }

      // 9. Add representment info ONLY after chargeback has been filed
      const repData = (dispute.transaction as any)?.chargeback_representment_static;
      const hasChargebackAction = dispute.chargeback_actions && dispute.chargeback_actions.length > 0;
      const chargebackFiledOrApproved = hasChargebackAction || ['completed', 'approved', 'closed_won'].includes(dispute.status.toLowerCase());
      if (repData && chargebackFiledOrApproved) {
// Calculate a 'filed-like' barrier timestamp: max of filed actions and final approved status
        let maxFiledLikeTs = 0;
        if (dispute.chargeback_actions && dispute.chargeback_actions.length > 0) {
          const filedActions = (dispute.chargeback_actions as any[]).filter(a => a.chargeback_filed);
          if (filedActions.length > 0) {
            maxFiledLikeTs = filedActions.reduce((max, action) => {
              const ts = new Date(action.updated_at || action.created_at).getTime();
              return Math.max(max, ts);
            }, 0);
          }
        }
        const isFinalApproved = ['completed', 'approved', 'closed_won'].includes(dispute.status?.toLowerCase() || '');
        if (isFinalApproved && dispute.updated_at) {
          maxFiledLikeTs = Math.max(maxFiledLikeTs, new Date(dispute.updated_at).getTime());
        }

        // Ensure representment appears AFTER the 'filed-like' barrier
        const repBaseTs = new Date(repData.updated_at || dispute.updated_at).getTime();
        const repTs = new Date(Math.max(repBaseTs, (maxFiledLikeTs || 0) + 1)).toISOString();
        const repActivity: Activity = {
          id: 'representment-status',
          timestamp: repTs,
          label: '',
          expandable: true,
          details: '',
          activityType: 'needs_attention'
        };
        switch (repData.representment_status) {
          case 'no_representment':
            repActivity.label = 'Merchant Representment Period Closed';
            repActivity.details = 'The merchant did not contest this chargeback within the allowed timeframe. Your chargeback remains approved.';
            repActivity.activityType = 'done';
            break;
          case 'pending':
            repActivity.label = 'Merchant Representment Received';
            repActivity.details = 'The merchant has contested this chargeback. Bank review is required.';
            repActivity.activityType = 'needs_attention';
            repActivity.showPendingRepresentmentActions = isBankAdmin;
            repActivity.representmentTransactionId = dispute.transaction.id;
            if (repData.merchant_reason_text) {
              repActivity.details += `\n\nMerchant's reason: ${repData.merchant_reason_text}`;
            }
            break;
          case 'awaiting_customer_info':
            // Only show "Waiting for Customer Response" if no evidence has been submitted yet
            if (!customerEvidence) {
              repActivity.label = 'Waiting for Customer Response';
              repActivity.details = 'The bank has requested additional evidence from the customer to contest the merchant\'s representment.';
              repActivity.activityType = 'paused';
            }
            // If customer evidence exists, skip this log entry (don't add it to activities)
            break;
          case 'customer_evidence_approved':
            // This status means customer evidence was approved and case is resolved - don't show standalone representment activity
            // The full flow will be shown by the customer evidence section below
            return; // Skip adding a representment activity here
          case 'accepted_by_bank':
            // For accepted representment, create 3 distinct activities
            // 1. Evidence reviewed (orange diamond)
            const network = dispute.transaction?.acquirer_name || 'Visa';
            const networkRefs: Record<string, string> = {
              'Mastercard': 'https://www.mastercardconnect.com/chargeback',
              'Visa': 'https://www.visa.com/viw',
              'Amex': 'https://www.americanexpress.com',
              'Rupay': 'https://www.rupay.co.in'
            };
            const networkPortal = networkRefs[network] || networkRefs['Visa'];
            
            activityList.push({
              id: 'rep-evidence-reviewed',
              timestamp: repTs,
              label: 'Evidence reviewed and found valid; customer chargeback request to be recalled',
              activityType: 'review_decision'
            });
            
            // 2. Chargeback recalled
            const caseRef = dispute.transaction.chargeback_case_id?.substring(0, 10) || 'REF-' + transactionId?.substring(0, 8);
            activityList.push({
              id: 'rep-chargeback-recalled',
              timestamp: new Date(new Date(repTs).getTime() + 1000).toISOString(),
              label: `Chargeback request Ref. No. ${caseRef} has been recalled from ${network}`,
              activityType: 'success'
            });
            
            // 3. Temporary credit reversed
            const reversalRef = dispute.transaction.temporary_credit_reversal_at 
              ? 'REV-' + new Date(dispute.transaction.temporary_credit_reversal_at).getTime().toString().substring(0, 10)
              : 'REV-' + Date.now().toString().substring(0, 10);
            activityList.push({
              id: 'rep-credit-reversed',
              timestamp: new Date(new Date(repTs).getTime() + 2000).toISOString(),
              label: `Temporary credit has been reversed. Reversal recorded under transaction Ref. No. ${reversalRef}.`,
              activityType: 'success'
            });
            
            // Don't push repActivity for accepted_by_bank since we've added the 3 activities above
            // Finalize activity list now so UI updates immediately and action buttons disappear
activityList.sort(compareActivities);
            setActivities(activityList);
            setTransactionDetails(dispute.transaction);
            return; // Exit early to skip the repActivity.push and the rest of the builder for this flow
            
          case 'rejected_by_bank':
            repActivity.label = 'Representment Rejected - Customer Wins';
            repActivity.details = 'The bank has rejected the merchant\'s representment. Your chargeback stands as approved.';
            repActivity.activityType = 'done';
            break;
        }
        
        // Only push repActivity if it has a label (avoids blank entries)
        if (repActivity.label) {
          activityList.push(repActivity);
        }

        // Add temporary credit reversal entry if representment was accepted and credit was reversed
        if (repData.representment_status === 'accepted_by_bank' && dispute.transaction.temporary_credit_reversal_at) {
          const reversalTs = new Date(dispute.transaction.temporary_credit_reversal_at).toISOString();
          const creditAmount = dispute.transaction.temporary_credit_amount || 0;
          activityList.push({
            id: 'temp-credit-reversal',
            timestamp: reversalTs,
            label: 'Temporary credit reversed',
            expandable: true,
            details: `Amount reversed: ₹${creditAmount.toLocaleString()}\n\nThe temporary credit has been reversed and deducted from your account as the merchant won the representment.`,
            activityType: 'human_action'
          });
        }
      }

      // 9. Customer evidence submission (if exists)
      if (transactionId) {
        const { data: customerEvidence } = await supabase
          .from('dispute_customer_evidence')
          .select('*')
          .eq('transaction_id', transactionId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (customerEvidence) {
          // Check if evidence has been reviewed
          const { data: review } = await supabase
            .from('customer_evidence_reviews')
            .select('*')
            .eq('customer_evidence_id', customerEvidence.id)
            .maybeSingle();

          const showReviewActions = isBankAdmin && !review && repData?.representment_status !== 'customer_evidence_approved';

          // Parse evidence files from evidence_url with proper structure
          let evidenceFiles: Array<{name: string; path: string; size: number; type: string}> = [];
          if (customerEvidence.evidence_url) {
            try {
              const parsed = typeof customerEvidence.evidence_url === 'string' 
                ? JSON.parse(customerEvidence.evidence_url) 
                : customerEvidence.evidence_url;
              evidenceFiles = Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              console.error('Failed to parse evidence_url');
            }
          }

          activityList.push({
            id: 'customer-evidence-submitted',
            timestamp: customerEvidence.created_at,
            label: 'Customer evidence received',
            expandable: false,
            activityType: 'success',
            attachments: evidenceFiles.length > 0 ? evidenceFiles.map(f => ({
              label: f.name,
              icon: 'document' as const
            })) : undefined,
            evidenceDocuments: evidenceFiles,
            showRepresentmentActions: showReviewActions,
            representmentTransactionId: transactionId
          });

          // 10. Add review result if exists
          if (review) {
            if (review.review_decision === 'approved') {
              // Rebuttal submitted
              activityList.push({
                id: 'rebuttal-submitted',
                timestamp: review.reviewed_at,
                label: 'Chargeback request upheld; response submitted on Visa Resolve Online',
                expandable: true,
                details: review.review_notes || 'Bank approved customer evidence and submitted rebuttal to card network',
                activityType: 'human_action',
                attachments: [
                  { label: 'Response details', icon: 'document' },
                  { label: 'Evidence details', icon: 'document' }
                ]
              });

              // Fetch visa video for the pill
              const { data: visaVideo } = await supabase
                .from('chargeback_videos')
                .select('*')
                .eq('card_network', 'Visa')
                .eq('is_active', true)
                .maybeSingle();

              // Rebuttal accepted (final status)
              const acceptedTimestamp = new Date(new Date(review.reviewed_at).getTime() + 24 * 60 * 60 * 1000).toISOString();
              const creditAmount = dispute.transaction?.temporary_credit_amount || 0;
              const acceptedAttachments: Activity['attachments'] = [
                { label: 'Transaction details', icon: 'document' }
              ];
              
              if (visaVideo) {
                acceptedAttachments.unshift({
                  label: 'www.visaonline.com/chargeback',
                  icon: 'video',
                  action: 'video',
                  videoData: visaVideo
                });
              }
              
              activityList.push({
                id: 'rebuttal-accepted',
                timestamp: acceptedTimestamp,
                label: 'Chargeback request accepted by Visa; Temporary credit earlier processed has been made permanent',
                expandable: false,
                activityType: 'done',
                attachments: acceptedAttachments
              });
            } else if (review.review_decision === 'rejected') {
              // Chargeback recalled
              const creditAmount = dispute.transaction?.temporary_credit_amount || 0;
              
              // Fetch visa video for the pill
              const { data: visaVideo } = await supabase
                .from('chargeback_videos')
                .select('*')
                .eq('card_network', 'Visa')
                .eq('is_active', true)
                .maybeSingle();
              
              const recalledAttachments: Activity['attachments'] = [];
              if (visaVideo) {
                recalledAttachments.push({
                  label: 'www.visaonline.com/chargeback',
                  icon: 'video',
                  action: 'video',
                  videoData: visaVideo
                });
              }
              
              activityList.push({
                id: 'chargeback-recalled',
                timestamp: review.reviewed_at,
                label: 'Chargeback recalled; Merchant wins',
                expandable: true,
                details: `${review.review_notes || 'Bank rejected customer evidence and recalled chargeback from card network'}\n\n${dispute.transaction?.temporary_credit_provided ? `Temporary credit of ₹${creditAmount.toLocaleString()} has been made permanent and remains with you.` : 'No temporary credit was issued.'}`,
                activityType: 'done',
                attachments: recalledAttachments
              });
            }
          }
        }
      }

      // Check for case resolved (merchant accepted evidence)
      const { data: actionLogs } = await supabase
        .from('dispute_action_log')
        .select('*')
        .eq('transaction_id', transactionId);

      const resolvedLog = actionLogs?.find(log => log.action === 'case_resolved_merchant_accepted');
      if (resolvedLog) {
        const creditAmount = dispute.transaction?.temporary_credit_amount || dispute.transaction?.transaction_amount || 0;
        const currency = dispute.transaction?.transaction_currency || 'INR';
        activityList.push({
          id: 'case-resolved-merchant-accepted',
          timestamp: resolvedLog.performed_at,
          label: 'Case Resolved - Merchant Accepted Evidence',
          expandable: true,
          details: `${resolvedLog.note || 'Customer evidence submitted. Merchant accepted evidence and case is resolved.'}\n\nTemporary credit of ${currency === 'USD' ? '$' : '₹'}${creditAmount.toLocaleString()} has been converted to permanent credit.\n\nCase is now closed.`,
          activityType: 'done',
        });
      }

      // Check for chargeback recalled (customer evidence rejected)
      const recalledLog = actionLogs?.find(log => log.action === 'chargeback_recalled');
      if (recalledLog && repData?.representment_status === 'customer_evidence_rejected') {
        const creditAmount = dispute.transaction?.temporary_credit_amount || dispute.transaction?.transaction_amount || 0;
        const currency = dispute.transaction?.transaction_currency || 'INR';
        const creditReversed = dispute.transaction?.temporary_credit_provided;
        const merchantDocUrl = repData?.merchant_document_url;
        const referenceNo = dispute.transaction?.chargeback_case_id || 'N/A';
        
        // Add evidence review activity
        const evidenceReviewTimestamp = new Date(new Date(recalledLog.performed_at).getTime() - 1000).toISOString();
        activityList.push({
          id: 'evidence-reviewed-rejected',
          timestamp: evidenceReviewTimestamp,
          label: 'Evidence reviewed and found valid; customer chargeback request to be recalled',
          activityType: 'human_action'
        });

        // Add chargeback recalled activity
        activityList.push({
          id: 'chargeback-recalled',
          timestamp: recalledLog.performed_at,
          label: `Chargeback request Ref. No. ${referenceNo} has been recalled from ${recalledLog.network || 'Visa'}`,
          activityType: 'done'
        });

        // Add credit reversal activity if applicable
        if (creditReversed) {
          const reversalTimestamp = new Date(new Date(recalledLog.performed_at).getTime() + 1000).toISOString();
          activityList.push({
            id: 'credit-reversed-recalled',
            timestamp: reversalTimestamp,
            label: `Temporary credit has been reversed. Reversal recorded under transaction Ref. No. REV-${Date.now()}.`,
            activityType: 'done'
          });
        }
      }

      // Check for chargeback actions (like representment accepted)
      if (transactionId) {
        const { data: chargebackActions } = await supabase
          .from('chargeback_actions')
          .select('*')
          .eq('transaction_id', transactionId)
          .order('created_at', { ascending: true });

        if (chargebackActions) {
          for (const action of chargebackActions) {
            if (action.action_type === 'representment_accepted' && repData?.representment_status === 'accepted_by_bank') {
              const creditAmount = action.net_amount || 0;
              const currency = dispute.transaction?.transaction_currency || 'INR';
              const creditReversed = action.temporary_credit_issued === false;
              
              activityList.push({
                id: `chargeback-action-${action.id}`,
                timestamp: action.created_at,
                label: 'Bank Decision: Merchant Wins - Representment Accepted',
                expandable: true,
                details: `${action.admin_message}\n\n${creditReversed ? `Temporary credit of ${currency === 'USD' ? '$' : '₹'}${creditAmount.toLocaleString()} has been reversed and deducted from your account.` : 'No temporary credit was issued.'}\n\n${action.internal_notes || ''}`,
                activityType: 'human_action',
              });
            }
          }
        }
      }

      // Check for write-off approval
      const writeOffDecision = (dispute as any).dispute_decisions?.find(
        (d: any) => d.decision === 'APPROVE_WRITEOFF'
      );
      
      if (writeOffDecision) {
        const writeOffAmount = dispute.transaction?.transaction_amount || 0;
        const currency = dispute.transaction?.transaction_currency || 'INR';
        
        // Find the document upload timestamp to ensure write-off appears after it
        const docUploadActivity = activityList.find(a => a.id === 'milestone-docs-uploaded');
        const docUploadTs = docUploadActivity ? new Date(docUploadActivity.timestamp).getTime() : 0;
        
        // Ensure write-off timestamp is after document upload (use dispute.updated_at which is after all actions)
        const writeOffTs = Math.max(
          new Date(writeOffDecision.created_at).getTime(),
          docUploadTs + 1,
          new Date(dispute.updated_at).getTime()
        );
        
        activityList.push({
          id: `write-off-${writeOffDecision.created_at}`,
          timestamp: new Date(writeOffTs).toISOString(),
          label: 'Write-off approved - Permanent credit issued',
          expandable: true,
          details: `Credit amount: ${currency === 'USD' ? '$' : '₹'}${writeOffAmount.toLocaleString()}\n\nThis transaction is below $15 and has been automatically approved for write-off after document verification.\n\nA permanent credit will be issued to the customer's account. No chargeback will be filed for this transaction.\n\nCase is now closed.`,
          activityType: 'done'
        });
      }
      
// Sort using unified comparator: time then stage
      activityList.sort(compareActivities);
      
      setActivities(activityList);
      setTransactionDetails(dispute.transaction);
    } catch (error) {
      console.error('Error loading dispute data:', error);
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };
  const toggleExpand = (id: string) => {
    setExpandedActivities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };
  const handleAttachmentClick = async (attachment: Activity['attachments'][number]) => {
    if (attachment.action === 'video' && attachment.videoData) {
      try {
        // Generate signed URL for video
        const {
          data,
          error
        } = await supabase.storage.from('chargeback-videos').createSignedUrl(attachment.videoData.video_path, 3600); // 1 hour expiry

        if (error) throw error;
        setPreviewContent({
          type: "video",
          url: data.signedUrl,
          cardNetwork: attachment.videoData.card_network,
          title: "Chargeback Filing"
        });
        setPreviewPaneOpen(true);
      } catch (error) {
        console.error('Failed to load video:', error);
      }
    } else if (attachment.action === 'document') {
      try {
        // Handle document view - show in preview pane with extracted fields
        if (!attachment.docData) {
          toast({
            title: "Document not available",
            description: "This document is not available for preview.",
            variant: "default"
          });
          return;
        }
        
        // Generate signed URL from storage path
        const storagePath = attachment.docData.path;
        if (!storagePath) {
          toast({
            title: "Document not available",
            description: "Document path not found.",
            variant: "default"
          });
          return;
        }
        
        console.log('Generating signed URL for path:', storagePath);
        
        const { data, error } = await supabase.storage
          .from('dispute-documents')
          .createSignedUrl(storagePath, 3600); // 1 hour expiry
        
        if (error) {
          console.error('Storage error:', error);
          throw error;
        }
        
        // Create document metadata fields
        const extractedFields: Array<{ label: string; value: string }> = [];
        
        // Add basic document metadata
        if (attachment.docData.requirementName) {
          extractedFields.push({ label: "Document Type", value: attachment.docData.requirementName });
        }
        if (attachment.docData.name || attachment.label) {
          extractedFields.push({ label: "File Name", value: attachment.docData.name || attachment.label });
        }
        if (attachment.docData.size) {
          const formatSize = (bytes: number) => {
            if (bytes < 1024) return bytes + " B";
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
            return (bytes / (1024 * 1024)).toFixed(1) + " MB";
          };
          extractedFields.push({ label: "File Size", value: formatSize(attachment.docData.size) });
        }
        if (attachment.docData.type) {
          extractedFields.push({ label: "File Type", value: attachment.docData.type });
        }
        
        setPreviewContent({
          type: "document",
          url: data.signedUrl,
          extractedFields,
          title: attachment.label || "Document"
        });
        setPreviewPaneOpen(true);
      } catch (error) {
        console.error('Failed to load document:', error);
        toast({
          title: "Error loading document",
          description: error instanceof Error ? error.message : "Failed to load document. The file may not exist in storage.",
          variant: "destructive"
        });
      }
    }
  };
  const handleApproveEvidence = async (transactionId: string) => {
    if (!confirm('Approve customer evidence and submit rebuttal to card network?')) {
      return;
    }
    setProcessingRepresentment(true);
    try {
      // Get most recent customer evidence
      const { data: evidence, error: evidenceError } = await supabase
        .from('dispute_customer_evidence')
        .select('id, created_at')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (evidenceError) throw evidenceError;
      
      if (!evidence) {
        throw new Error('No customer evidence found for this transaction');
      }

      const { data: fnData, error: fnError } = await supabase.functions.invoke('approve-customer-evidence', {
        body: {
          transaction_id: transactionId,
          customer_evidence_id: evidence.id,
          review_notes: 'Customer evidence approved and rebuttal submitted to Visa'
        }
      });
      
      if (fnError) throw new Error(fnError.message || JSON.stringify(fnError));
      
      toast({
        title: "Evidence Approved",
        description: "Rebuttal has been submitted to the card network."
      });
      await loadDisputeData();
    } catch (error) {
      console.error('Error approving evidence:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to approve evidence",
        variant: "destructive"
      });
    } finally {
      setProcessingRepresentment(false);
    }
  };

  const handleRejectEvidence = async (transactionId: string) => {
    if (!confirm('Reject customer evidence and recall chargeback? This will uphold the merchant response.')) {
      return;
    }
    setProcessingRepresentment(true);
    try {
      // Get most recent customer evidence
      const { data: evidence, error: evidenceError } = await supabase
        .from('dispute_customer_evidence')
        .select('id, created_at')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (evidenceError) throw evidenceError;

      if (!evidence) {
        throw new Error('No customer evidence found for this transaction');
      }

      const { data: fnData, error: fnError } = await supabase.functions.invoke('reject-customer-evidence', {
        body: {
          transaction_id: transactionId,
          customer_evidence_id: evidence.id,
          review_notes: 'Customer evidence rejected, chargeback recalled'
        }
      });
      
      if (fnError) throw new Error(fnError.message || JSON.stringify(fnError));
      
      toast({
        title: "Evidence Rejected",
        description: "Chargeback has been recalled from the card network."
      });
      await loadDisputeData();
    } catch (error) {
      console.error('Error rejecting evidence:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reject evidence",
        variant: "destructive"
      });
    } finally {
      setProcessingRepresentment(false);
    }
  };

  const handleAcceptRepresentment = async (transactionId: string) => {
    if (!confirm('Accept merchant representment? This will close the case in favor of the merchant and reverse any temporary credit.')) {
      return;
    }
    setProcessingRepresentment(true);
    try {
      const {
        error
      } = await supabase.functions.invoke('accept-representment', {
        body: {
          transaction_id: transactionId
        }
      });
      if (error) throw error;
      toast({
        title: "Representment Accepted",
        description: "Merchant wins. Temporary credit has been reversed."
      });
      await loadDisputeData();
    } catch (error) {
      console.error('Error accepting representment:', error);
      toast({
        title: "Error",
        description: "Failed to accept representment. Please try again.",
        variant: "destructive"
      });
    } finally {
      setProcessingRepresentment(false);
    }
  };
  const handleRejectRepresentment = async (transactionId: string) => {
    if (!confirm('Reject merchant representment? This will ask the customer for additional evidence.')) {
      return;
    }
    setProcessingRepresentment(true);
    try {
      const {
        error
      } = await supabase.functions.invoke('reject-representment', {
        body: {
          transaction_id: transactionId
        }
      });
      if (error) throw error;
      toast({
        title: "Representment Rejected",
        description: "Customer has been asked for additional evidence."
      });
      await loadDisputeData();
    } catch (error) {
      console.error('Error rejecting representment:', error);
      toast({
        title: "Error",
        description: "Failed to reject representment. Please try again.",
        variant: "destructive"
      });
    } finally {
      setProcessingRepresentment(false);
    }
  };
  const handleSubmitComment = () => {
    if (!inputText.trim()) return;
    const newActivity: Activity = {
      id: `comment-${Date.now()}`,
      timestamp: new Date().toISOString(),
      label: inputText,
      reviewer: "Adam Smith",
      activityType: 'message'
    };
    setActivities(prev => [...prev, newActivity]);
    setInputText("");
  };
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmitComment();
    }
  };
  const getActivityIcon = (type?: Activity['activityType'], color?: string) => {
    const iconClasses = "h-2.5 w-2.5 flex-shrink-0";
    
    // Special handling for green colored done activities (final resolution)
    if (type === 'done' && color === 'green') {
      return <div className={cn(iconClasses, "rounded-full bg-green-600 dark:bg-green-500")} />;
    }
    
    switch (type) {
      case 'error':
        return <div className={cn(iconClasses, "rotate-45 rounded-sm border-2 border-red-500 bg-background")} />;
      case 'needs_attention':
        return <div className={cn(iconClasses, "rotate-45 rounded-sm border-2 border-orange-500 bg-background")} />;
      case 'review_decision':
        return <div className={cn(iconClasses, "rotate-45 rounded-sm border-2 border-orange-500 bg-orange-100 dark:bg-orange-900/30")} />;
      case 'paused':
        return <div className={cn(iconClasses, "rotate-45 rounded-sm border-2 border-gray-400 bg-background")} />;
      case 'loading':
        return <div className={cn(iconClasses, "rotate-45 rounded-sm border-2 border-gray-400 bg-background")} />;
      case 'message':
        return <div className={cn(iconClasses, "rounded border-2 border-purple-400 bg-background")} />;
      case 'success':
      case 'done':
        return <div className={cn(iconClasses, "rounded-full bg-green-500")} />;
      case 'human_action':
        return <div className={cn(iconClasses, "rounded-full border-2 border-blue-400 bg-background")} />;
      case 'void':
        return <div className={cn(iconClasses, "rounded border-2 border-gray-500 bg-background")} />;
      default:
        return <div className={cn(iconClasses, "rounded border-2 border-gray-400 bg-background")} />;
    }
  };
  const groupActivitiesByDate = () => {
// Sort activities by timestamp ascending (oldest first), then by stage priority if timestamps match
    const sortedActivities = [...activities].sort(compareActivities);
    const groups: Array<{
      label: string;
      activities: Activity[];
      sortKey: number;
    }> = [];
    const groupMap: Record<string, Activity[]> = {};
    sortedActivities.forEach(activity => {
      const date = new Date(activity.timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      let dateLabel: string;
      let sortKey: number;
      if (date.toDateString() === today.toDateString()) {
        dateLabel = "Today";
        sortKey = Date.now() + 2000; // Today last (highest value)
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateLabel = "Yesterday";
        sortKey = Date.now() + 1000; // Yesterday second to last
      } else {
        dateLabel = format(date, "dd MMM yyyy");
        sortKey = date.getTime(); // Older dates first (smaller timestamps = lower sort key)
      }
      if (!groupMap[dateLabel]) {
        groupMap[dateLabel] = [];
        groups.push({
          label: dateLabel,
          activities: groupMap[dateLabel],
          sortKey
        });
      }
      groupMap[dateLabel].push(activity);
    });

    // Sort groups by sortKey (older dates first, then Yesterday, then Today)
    return groups.sort((a, b) => a.sortKey - b.sortKey);
  };
  const getStatusBadge = () => {
    const statusMap: Record<string, {
      label: string;
      color: string;
    }> = {
      completed: {
        label: "Done",
        color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      },
      approved: {
        label: "Approved",
        color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      },
      chargeback_filed: {
        label: "Chargeback filed",
        color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
      },
      under_review: {
        label: "Under review",
        color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
      },
      awaiting_merchant_refund: {
        label: "Awaiting refund",
        color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
      },
      awaiting_settlement: {
        label: "Awaiting settlement",
        color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
      },
      pending_manual_review: {
        label: "Manual review",
        color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
      },
      rejected: {
        label: "Rejected",
        color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
      },
      void: {
        label: "Void",
        color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
      },
      cancelled: {
        label: "Cancelled",
        color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
      },
      ineligible: {
        label: "Ineligible",
        color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
      },
      in_progress: {
        label: "In progress",
        color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
      },
      needs_attention: {
        label: "Needs attention",
        color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
      }
    };
    return statusMap[status] || statusMap.in_progress;
  };
  if (loading) {
    return <div className="animate-fade-in">
        <div className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-6 w-64" />
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="flex gap-4">
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>)}
        </div>
      </div>;
  }
  const groupedActivities = groupActivitiesByDate();
  const statusBadge = getStatusBadge();
  return <div className="flex h-screen bg-background">
      {/* Left Sidebar */}
      <div className={cn("transition-all duration-300 ease-in-out overflow-hidden", isSidebarOpen ? "w-56" : "w-0")}>
        <DashboardSidebar activeSection="chargebacks" />
      </div>

      {/* Main & Preview Split */}
      <div className="flex flex-1 h-full min-w-0">
        {/* Activity + Key Details container */}
        <div className={cn(
          "flex h-full min-w-0 transition-all duration-300 ease-in-out",
          previewPaneOpen ? "w-1/2" : "w-full"
        )}>
          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Header */}
        <div className="border-b px-6 py-3 bg-background">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="h-8 w-8">
                <PanelLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm text-muted-foreground">
                Chargebacks / Activity Logs
              </div>
            </div>
            
          </div>
        </div>

        {/* Status Info */}
        <div className="border-b px-6 py-3 bg-background">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                Tid {transactionId}
              </span>
              <span className={cn("text-xs px-2 py-1 rounded-full font-medium", statusBadge.color)}>
                {statusBadge.label}
              </span>
            </div>
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="flex-1 overflow-auto px-6 py-6 bg-background">
          <div className="max-w-4xl space-y-8">
            {groupedActivities.map((group, groupIndex) => <div key={group.label}>
                {/* Date Separator */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-px flex-1 bg-border" />
                  <div className="text-sm text-muted-foreground font-medium">{group.label}</div>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Activities for this date */}
                <div className="space-y-6">
                  {group.activities.map((activity, index) => {
                const isFirstActivity = groupIndex === 0 && index === 0;
                const isLastInGroup = index === group.activities.length - 1;
                const isLastGroup = groupIndex === groupedActivities.length - 1;
                const isLastActivity = isLastInGroup && isLastGroup;
                return <div key={activity.id} className="flex gap-4 relative">
                        {/* Time */}
                        <div className="text-sm text-muted-foreground w-20 flex-shrink-0 flex items-center h-[44px]">
                          {format(new Date(activity.timestamp), "h:mm a")}
                        </div>

                        {/* Icon with connecting line */}
                        <div className="flex-shrink-0 relative">
                          {/* Connecting line above - ends with gap before icon */}
                          {!isFirstActivity && <div className="absolute left-1/2 -translate-x-1/2 top-0 h-[18px] w-px bg-border z-0" />}
                          
                          <div className="flex items-center h-[44px] relative z-10">
                            {getActivityIcon(activity.activityType, activity.color)}
                          </div>
                          
                          {/* Connecting line below - starts with gap after icon */}
                          {!isLastActivity && <div className="absolute left-1/2 -translate-x-1/2 top-[26px] h-[calc(100%-26px+24px)] w-px bg-border z-0" />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="rounded-lg p-3">
                          <div className="font-medium text-sm mb-1">{activity.label}</div>
                          
                          {/* Tag */}
                          {activity.tag && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs font-medium mb-2">
                              <span>{activity.tag}</span>
                            </div>
                          )}
                          
                          {/* Link Pill */}
                          {activity.link && (
                            <a 
                              href={activity.link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs font-medium hover:bg-muted/80 transition-colors mb-2"
                            >
                              <span>🔗 Network Portal</span>
                            </a>
                          )}
                          
                          {/* Reasoning with checkmarks */}
                          {activity.reasoning && activity.reasoning.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {activity.reasoning.map((reason, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                                  <span>{reason}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* Expandable Details */}
                          {activity.expandable && !activity.reasoning && <button onClick={() => toggleExpand(activity.id)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
                              <span>See reasoning</span>
                              <ChevronRight className={cn("h-3 w-3 transition-transform", expandedActivities.has(activity.id) && "rotate-90")} />
                            </button>}

                          {/* Expanded Details */}
                          {expandedActivities.has(activity.id) && activity.details && <div className="mt-2 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground whitespace-pre-line">
                              {activity.details}
                            </div>}

                          {/* Pending Representment Action Buttons */}
                          {activity.showPendingRepresentmentActions && activity.representmentTransactionId && <div className="mt-3 flex gap-2">
                              <Button size="sm" variant="destructive" onClick={() => handleAcceptRepresentment(activity.representmentTransactionId!)} disabled={processingRepresentment} className="gap-2">
                                <Check className="h-4 w-4" />
                                Accept Representment
                                <span className="text-xs block">(Merchant Wins)</span>
                              </Button>
                              <Button size="sm" variant="default" onClick={() => handleRejectRepresentment(activity.representmentTransactionId!)} disabled={processingRepresentment} className="gap-2">
                                <X className="h-4 w-4" />
                                Reject Representment
                                <span className="text-xs block">(Ask Customer)</span>
                              </Button>
                            </div>}

                          {/* Representment Action Buttons (for customer evidence review) */}
                          {activity.showRepresentmentActions && activity.representmentTransactionId && <div className="mt-3 flex gap-2">
                              <Button size="sm" variant="default" onClick={() => handleApproveEvidence(activity.representmentTransactionId!)} disabled={processingRepresentment} className="gap-2">
                                <Check className="h-4 w-4" />
                                Approve & Submit Rebuttal
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleRejectEvidence(activity.representmentTransactionId!)} disabled={processingRepresentment} className="gap-2">
                                <X className="h-4 w-4" />
                                Reject & Recall Chargeback
                              </Button>
                            </div>}

                          {/* Attachments */}
                          {activity.attachments && activity.attachments.length > 0 && <div className="mt-3 space-y-2">
                              {activity.attachments.map((attachment, i) => {
                                // Video attachments with visaonline URL should be clickable artifact buttons
                                if (attachment.action === 'video' && attachment.label?.includes('visaonline')) {
                                  return <button 
                                    key={i}
                                    onClick={() => handleAttachmentClick(attachment)}
                                    className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md hover:bg-muted transition-colors text-sm"
                                  >
                                    <img src={videoIcon} alt="video" className="h-4 w-4" />
                                    <span>{attachment.label}</span>
                                  </button>;
                                }
                                
                                if (attachment.link) {
                                  return <a 
                                    key={i}
                                    href={attachment.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md hover:bg-muted transition-colors text-sm"
                                  >
                                    {attachment.icon === 'database' ? (
                                      <Database className="h-4 w-4" />
                                    ) : attachment.icon === 'document' ? (
                                      <FileText className="h-4 w-4" />
                                    ) : attachment.icon === 'link' ? (
                                      <Share2 className="h-4 w-4" />
                                    ) : attachment.icon === 'video' ? (
                                      <img src={videoIcon} alt="video" className="h-4 w-4" />
                                    ) : (
                                      <span>{attachment.icon}</span>
                                    )}
                                    <span>{attachment.label}</span>
                                  </a>;
                                }
                                return <button key={i} onClick={() => handleAttachmentClick(attachment)} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md hover:bg-muted transition-colors text-sm">
                                    {attachment.icon === 'database' ? (
                                      <Database className="h-4 w-4" />
                                    ) : attachment.icon === 'document' ? (
                                      <FileText className="h-4 w-4" />
                                    ) : attachment.icon === 'video' ? (
                                      <img src={videoIcon} alt="video" className="h-4 w-4" />
                                    ) : (
                                      <span>{attachment.icon}</span>
                                    )}
                                    <span>{attachment.label}</span>
                                  </button>;
                              })}
                            </div>}

                          {/* Evidence Documents with Download */}
                          {activity.evidenceDocuments && activity.evidenceDocuments.length > 0 && <div className="mt-3 space-y-2">
                              {activity.evidenceDocuments.map((doc, i) => <button 
                                  key={i}
                                  onClick={async () => {
                                    try {
                                      const { data, error } = await supabase.storage
                                        .from('dispute-documents')
                                        .download(doc.path);
                                      
                                      if (error) throw error;
                                      
                                      const url = URL.createObjectURL(data);
                                      const a = document.createElement('a');
                                      a.href = url;
                                      a.download = doc.name;
                                      document.body.appendChild(a);
                                      a.click();
                                      document.body.removeChild(a);
                                      URL.revokeObjectURL(url);
                                      
                                      toast({
                                        title: "Downloaded",
                                        description: `Downloaded ${doc.name}`,
                                      });
                                    } catch (error) {
                                      console.error('Download error:', error);
                                      toast({
                                        title: "Download Failed",
                                        description: "Failed to download document",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md hover:bg-muted transition-colors text-sm"
                                >
                                  <FileText className="h-4 w-4" />
                                  <span>{doc.name}</span>
                                  <span className="text-xs text-muted-foreground ml-auto">
                                    ({(doc.size / 1024).toFixed(1)} KB)
                                  </span>
                                </button>)}
                            </div>}

                          {/* Reviewer */}
                          {activity.reviewer && <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>✓</span>
                              <span>Reviewed by {activity.reviewer}</span>
                            </div>}
                          </div>
                        </div>
                      </div>;
              })}
                </div>
              </div>)}
          </div>
        </div>

        {/* Footer - Input Box */}
        <div className="border-t px-6 py-4 bg-background">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2 bg-muted/30 rounded-lg border px-4 py-2">
              
              <Input value={inputText} onChange={e => setInputText(e.target.value)} onKeyPress={handleKeyPress} placeholder="Work with Pace. Log any updates or key notes for future reference." className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm" />
              <Button onClick={handleSubmitComment} size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0 rounded-full hover:bg-primary hover:text-primary-foreground" disabled={!inputText.trim()}>
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Key Details Sidebar - hidden when preview is open */}
      {!previewPaneOpen && (
        <div className="w-80 border-l bg-card flex flex-col">
          {/* Knowledge Base and Share buttons at top */}
          <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-8 gap-2" onClick={() => setIsKnowledgeBaseOpen(true)}>
              <BookOpen className="h-4 w-4" />
              <span>Knowledge Base</span>
            </Button>
            <Button variant="ghost" size="sm" className="h-8 gap-2">
              <Share2 className="h-4 w-4" />
              <span>Share</span>
            </Button>
          </div>
        </div>

        {/* Key Details Header */}
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Database className="h-4 w-4" />
            Key details
          </div>
        </div>

        {/* Key Details Content */}
        <div className="flex-1 overflow-auto px-4 py-4">
          {transactionDetails ? <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Layers className="h-4 w-4" />
                <span>Disputed transaction</span>
              </div>

              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-muted-foreground">Transaction ID</span>
                  <span className="font-medium">{transactionDetails.transaction_id || transactionId}</span>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-muted-foreground">Transaction Date</span>
                  <span className="font-medium">
                    {transactionDetails.transaction_time ? format(new Date(transactionDetails.transaction_time), "dd/MM/yyyy") : "N/A"}
                  </span>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-muted-foreground">Reference No.</span>
                  <span className="font-medium">{transactionDetails.chargeback_case_id?.substring(0, 10) || "N/A"}</span>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium">
                    {transactionDetails.transaction_currency === 'INR' ? '₹' : transactionDetails.transaction_currency === 'USD' ? '$' : transactionDetails.transaction_currency === 'EUR' ? '€' : transactionDetails.transaction_currency === 'GBP' ? '£' : transactionDetails.transaction_currency + ' '}
                    {transactionDetails.transaction_amount?.toLocaleString() || "0"}
                  </span>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-muted-foreground">Merchant Name</span>
                  <span className="font-medium">{transactionDetails.merchant_name || "N/A"}</span>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-muted-foreground">Card Network</span>
                  <span className="font-medium">{transactionDetails.acquirer_name || "N/A"}</span>
                </div>
              </div>
            </div> : <div className="text-sm text-muted-foreground">No transaction details available</div>}
        </div>
      </div>
      )}
      </div>

        {/* Preview Pane - slides in from the right */}
        {previewPaneOpen && (
          <div className="w-1/2 border-l border-border animate-in slide-in-from-right duration-300 overflow-hidden">
            <PreviewPane 
              isOpen={previewPaneOpen} 
              onClose={() => setPreviewPaneOpen(false)} 
              type={previewContent?.type || null}
              videoUrl={previewContent?.type === "video" ? previewContent.url : undefined}
              cardNetwork={previewContent?.cardNetwork}
              documentUrl={previewContent?.type === "document" ? previewContent.url : undefined}
              extractedFields={previewContent?.extractedFields}
              title={previewContent?.title}
            />
          </div>
        )}
      </div>

      {/* Knowledge Base Overlay */}
      <KnowledgeBasePanel 
        isOpen={isKnowledgeBaseOpen}
        isClosing={isKnowledgeBaseClosing}
        onClose={handleCloseKnowledgeBase}
      />
    </div>;
};
export default ActivityLogView;