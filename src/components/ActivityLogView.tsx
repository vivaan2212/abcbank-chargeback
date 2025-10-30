import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, Database, BookOpen, Share2, Menu, ArrowUp } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import DashboardSidebar from "./DashboardSidebar";
import { Input } from "@/components/ui/input";
import { ChargebackVideoModal } from "./ChargebackVideoModal";

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
  }>;
  reviewer?: string;
  activityType?: 'error' | 'needs_attention' | 'paused' | 'loading' | 'message' | 'success' | 'human_action' | 'done' | 'void';
}

interface ActivityLogViewProps {
  disputeId: string;
  transactionId: string | null;
  status: string;
  onBack: () => void;
}

const ActivityLogView = ({ disputeId, transactionId, status, onBack }: ActivityLogViewProps) => {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<{
    url: string;
    cardNetwork: string;
  } | null>(null);

  useEffect(() => {
    loadDisputeData();
  }, [disputeId]);

  // Realtime updates for dispute status and chargeback actions
  useEffect(() => {
    if (!disputeId) return;

    const channel = supabase
      .channel(`activity-log-${disputeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chargeback_actions', filter: `dispute_id=eq.${disputeId}` }, () => {
        loadDisputeData();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'disputes', filter: `id=eq.${disputeId}` }, () => {
        loadDisputeData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [disputeId]);


  const loadDisputeData = async () => {
    setLoading(true);
    try {
      // Load dispute with all related data
      const { data: dispute, error } = await supabase
        .from('disputes')
        .select(`
          *,
          transaction:transactions(
            *,
            chargeback_representment_static(*)
          ),
          chargeback_actions(
            *,
            video:chargeback_videos(id, card_network, video_path)
          )
        `)
        .eq('id', disputeId)
        .single();

      if (error) throw error;

      // Build activities from dispute data - milestone-based approach
      const activityList: Activity[] = [];

      // 1. Dispute received milestone
      activityList.push({
        id: 'milestone-received',
        timestamp: dispute.created_at,
        label: 'Received a disputed transaction',
        attachments: dispute.documents ? [{ label: 'Disputed transaction', icon: '📄' }] : undefined,
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
              icon: '📄'
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
              details: `Credit amount: ₹${creditAmount.toLocaleString()}\n\nA temporary credit has been issued to your account while we investigate the dispute. This credit will be made permanent if the chargeback is successful.`,
              reviewer: 'Rohit Kapoor',
              activityType: 'done'
            });
          }
          
          // Credit decision milestone (only if no temp credit)
          if (action.action_type && !action.temporary_credit_issued) {
            let label = 'Not recommended for temporary credit';
            
            if (action.awaiting_settlement) {
              label = 'Awaiting settlement before credit decision';
            } else if (action.awaiting_merchant_refund) {
              label = 'Awaiting merchant refund';
            } else if (action.requires_manual_review) {
              label = `Not recommended for write-off as it's unsettled >${action.days_since_transaction} days`;
            }
            
            activityList.push({
              id: `action-${idx}-credit`,
              timestamp: action.created_at,
              label,
              expandable: reasoningDetails ? true : false,
              details: reasoningDetails,
              reviewer: 'Rohit Kapoor',
              activityType: action.requires_manual_review ? 'needs_attention' : 'human_action'
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
              details: action.is_facebook_meta 
                ? `Transaction with Facebook/Meta detected. These merchants typically issue refunds within 14 days.\n\nDays elapsed: ${daysSince}\nEstimated days remaining: ${daysRemaining}\n\nWe'll automatically monitor for the refund and update the case accordingly.`
                : `The merchant has been contacted for a refund. This is often faster than filing a chargeback.\n\nDays elapsed: ${daysSince}\n\nWe'll monitor for the refund and proceed with chargeback filing if no refund is received.`,
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
              reviewer: 'Rohit Kapoor',
              activityType: 'needs_attention'
            });
          }
          
          // Review status milestone
          if (action.updated_at !== action.created_at) {
            activityList.push({
              id: `action-${idx}-reviewed`,
              timestamp: action.updated_at,
              label: 'Marked as reviewed',
              reviewer: 'Rohit Kapoor',
              activityType: 'success'
            });
          }

          // Chargeback filed milestone
          if (action.chargeback_filed) {
            const attachments: Activity['attachments'] = [
              { label: 'View Document', icon: '📄', action: 'document' }
            ];
            
            // Add video recording if available
            if (action.video) {
              attachments.push({
                label: 'Video Recording',
                icon: '🎥',
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
        const finalStatuses = ['completed', 'approved', 'rejected', 'void', 'cancelled'];
        
        if (finalStatuses.includes(dispute.status.toLowerCase())) {
          let label = '';
          let activityType: Activity['activityType'] = 'done';
          let details = '';
          let attachments: Activity['attachments'] | undefined = undefined;
          
          switch (dispute.status.toLowerCase()) {
            case 'completed':
            case 'approved':
              label = 'Chargeback approved - Case resolved';
              activityType = 'done';
              const resolvedAmount = dispute.chargeback_actions?.[0]?.net_amount || dispute.transaction?.transaction_amount || 0;
              details = `Your chargeback has been approved by the card network.\n\nResolved amount: ₹${resolvedAmount.toLocaleString()}\n\nThe funds have been permanently credited to your account. The case is now closed.`;
              
              // Add video attachment for approved cases - fetch video based on card network
              attachments = [
                { label: 'View Document', icon: '📄', action: 'document' }
              ];
              
              // If no chargeback_actions but dispute is approved, fetch video by card network
              if (!dispute.chargeback_actions || dispute.chargeback_actions.length === 0) {
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
                
                // Fetch video from database
                const { data: videoData } = await supabase
                  .from('chargeback_videos')
                  .select('*')
                  .eq('card_network', cardNetwork)
                  .eq('is_active', true)
                  .single();
                
                if (videoData) {
                  attachments.push({
                    label: 'Video Recording',
                    icon: '🎥',
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
              details = action?.admin_message || 
                'The chargeback was not approved by the card network. This may be due to insufficient evidence or the transaction being outside the dispute window.\n\nIf you have additional evidence, you may be able to file a new dispute.';
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


      // Sort by timestamp
      activityList.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Add representment info after sorting if exists
      const repData = (dispute.transaction as any)?.chargeback_representment_static;
      if (repData && repData.representment_status !== 'no_representment') {
        const repActivity: Activity = {
          id: 'representment-status',
          timestamp: repData.updated_at || dispute.updated_at,
          label: '',
          expandable: true,
          details: '',
          activityType: 'needs_attention'
        };

        switch (repData.representment_status) {
          case 'pending':
            repActivity.label = 'Merchant Representment Received';
            repActivity.details = 'The merchant has contested this chargeback. Bank review is required.';
            repActivity.activityType = 'needs_attention';
            if (repData.merchant_reason_text) {
              repActivity.details += `\n\nMerchant's reason: ${repData.merchant_reason_text}`;
            }
            break;
          case 'awaiting_customer_info':
            repActivity.label = 'Waiting for Customer Response';
            repActivity.details = 'The bank has requested additional evidence from the customer to contest the merchant\'s representment.';
            repActivity.activityType = 'paused';
            break;
          case 'accepted_by_bank':
            repActivity.label = 'Representment Accepted - Merchant Wins';
            repActivity.details = 'The bank has accepted the merchant\'s representment. The chargeback is closed in favor of the merchant.';
            repActivity.activityType = 'error';
            break;
        }

        activityList.push(repActivity);
      }

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
        const { data, error } = await supabase.storage
          .from('chargeback-videos')
          .createSignedUrl(attachment.videoData.video_path, 3600); // 1 hour expiry
        
        if (error) throw error;
        
        setSelectedVideo({
          url: data.signedUrl,
          cardNetwork: attachment.videoData.card_network
        });
        setVideoModalOpen(true);
      } catch (error) {
        console.error('Failed to load video:', error);
      }
    } else if (attachment.action === 'document') {
      // Handle document view (existing functionality)
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

  const getActivityIcon = (type?: Activity['activityType']) => {
    const iconClasses = "h-2.5 w-2.5 flex-shrink-0";
    
    switch (type) {
      case 'error':
        return <div className={cn(iconClasses, "rotate-45 rounded-sm border-2 border-red-500 bg-background")} />;
      case 'needs_attention':
        return <div className={cn(iconClasses, "rotate-45 rounded-sm border-2 border-orange-500 bg-background")} />;
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
    // Sort activities by timestamp ascending (oldest first)
    const sortedActivities = [...activities].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const groups: Array<{ label: string; activities: Activity[]; sortKey: number }> = [];
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
        sortKey = 2; // Today last
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateLabel = "Yesterday";
        sortKey = 1; // Yesterday in middle
      } else {
        dateLabel = format(date, "dd MMM yyyy");
        sortKey = 0 - date.getTime(); // Older dates first (more negative = earlier date = lower sort key)
      }

      if (!groupMap[dateLabel]) {
        groupMap[dateLabel] = [];
        groups.push({ label: dateLabel, activities: groupMap[dateLabel], sortKey });
      }
      groupMap[dateLabel].push(activity);
    });

    // Sort groups by sortKey (older dates first, then Yesterday, then Today)
    return groups.sort((a, b) => a.sortKey - b.sortKey);
  };

  const getStatusBadge = () => {
    const statusMap: Record<string, { label: string; color: string }> = {
      completed: { label: "Done", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
      approved: { label: "Approved", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
      chargeback_filed: { label: "Chargeback filed", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
      under_review: { label: "Under review", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
      awaiting_merchant_refund: { label: "Awaiting refund", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
      awaiting_settlement: { label: "Awaiting settlement", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
      pending_manual_review: { label: "Manual review", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
      rejected: { label: "Rejected", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
      void: { label: "Void", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" },
      cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" },
      ineligible: { label: "Ineligible", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" },
      in_progress: { label: "In progress", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
      needs_attention: { label: "Needs attention", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" }
    };
    return statusMap[status] || statusMap.in_progress;
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
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
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const groupedActivities = groupActivitiesByDate();
  const statusBadge = getStatusBadge();

  return (
    <div className="h-full flex animate-fade-in">
      {/* Left Sidebar */}
      <div className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden",
        isSidebarOpen ? "w-56" : "w-0"
      )}>
        <DashboardSidebar activeSection="chargebacks" />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Header */}
        <div className="border-b px-6 py-4 bg-background">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="h-8 w-8"
              >
                <Menu className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm text-muted-foreground">
                Chargebacks / Activity Logs
              </div>
            </div>
            
          </div>
        </div>

        {/* Status Info */}
        <div className="border-b px-6 py-4 bg-background">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-muted-foreground mb-1">
                Tid {transactionId}
              </div>
              <div className="flex items-center gap-3">
                <span className={cn("text-xs px-2 py-1 rounded-full font-medium", statusBadge.color)}>
                  {statusBadge.label}
                </span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              1 / 5195
            </div>
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="flex-1 overflow-auto px-6 py-6 bg-background">
          <div className="max-w-3xl space-y-8">
            {groupedActivities.map((group, groupIndex) => (
              <div key={group.label}>
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

                    return (
                      <div key={activity.id} className="flex gap-4 relative">
                        {/* Time */}
                        <div className="text-sm text-muted-foreground w-20 flex-shrink-0 pt-0.5">
                          {format(new Date(activity.timestamp), "h:mm a")}
                        </div>

                        {/* Icon with connecting line */}
                        <div className="flex-shrink-0 pt-0.5 relative">
                          {/* Connecting line above */}
                          {!isFirstActivity && (
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full h-6 w-px bg-border" />
                          )}
                          
                          {getActivityIcon(activity.activityType)}
                          
                          {/* Connecting line below */}
                          {!isLastActivity && (
                            <div className="absolute left-1/2 -translate-x-1/2 top-full h-6 w-px bg-border" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm mb-1">{activity.label}</div>
                          
                          {/* Expandable Details */}
                          {activity.expandable && (
                            <button
                              onClick={() => toggleExpand(activity.id)}
                              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
                            >
                              <span>See reasoning</span>
                              <ChevronRight className={cn(
                                "h-3 w-3 transition-transform",
                                expandedActivities.has(activity.id) && "rotate-90"
                              )} />
                            </button>
                          )}

                          {/* Expanded Details */}
                          {expandedActivities.has(activity.id) && activity.details && (
                            <div className="mt-2 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground whitespace-pre-line">
                              {activity.details}
                            </div>
                          )}

                          {/* Attachments */}
                          {activity.attachments && activity.attachments.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {activity.attachments.map((attachment, i) => (
                                <button
                                  key={i}
                                  onClick={() => handleAttachmentClick(attachment)}
                                  className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md hover:bg-muted transition-colors text-sm"
                                >
                                  <span>{attachment.icon}</span>
                                  <span>{attachment.label}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Reviewer */}
                          {activity.reviewer && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>✓</span>
                              <span>Reviewed by {activity.reviewer}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer - Input Box */}
        <div className="border-t px-6 py-4 bg-background">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 bg-muted/30 rounded-lg border px-4 py-2">
              <Input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Work with Pace or anyone else"
                className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
              />
              <Button
                onClick={handleSubmitComment}
                size="icon"
                variant="ghost"
                className="h-8 w-8 flex-shrink-0 rounded-full hover:bg-primary hover:text-primary-foreground"
                disabled={!inputText.trim()}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Key Details Sidebar */}
      <div className="w-80 border-l bg-card flex flex-col">
        {/* Knowledge Base and Share buttons at top */}
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-8 gap-2">
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
          {transactionDetails ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Database className="h-4 w-4" />
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
                    {transactionDetails.transaction_date 
                      ? format(new Date(transactionDetails.transaction_date), "dd/MM/yyyy")
                      : "N/A"}
                  </span>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-muted-foreground">Reference No.</span>
                  <span className="font-medium">{transactionDetails.arn || "N/A"}</span>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium">₹{transactionDetails.transaction_amount?.toLocaleString() || "0"}</span>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-muted-foreground">Merchant Name</span>
                  <span className="font-medium">{transactionDetails.merchant_name || "N/A"}</span>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-muted-foreground">Card Network</span>
                  <span className="font-medium">{transactionDetails.card_type || "N/A"}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No transaction details available</div>
          )}
        </div>
      </div>

      {/* Video Modal */}
      <ChargebackVideoModal
        isOpen={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        videoUrl={selectedVideo?.url || null}
        cardNetwork={selectedVideo?.cardNetwork || null}
      />
    </div>
  );
};

export default ActivityLogView;
