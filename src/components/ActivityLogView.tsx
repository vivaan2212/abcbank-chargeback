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

interface Activity {
  id: string;
  timestamp: string;
  label: string;
  expandable?: boolean;
  expanded?: boolean;
  details?: string;
  attachments?: Array<{ label: string; icon: string }>;
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

  useEffect(() => {
    loadDisputeData();
  }, [disputeId]);

  const loadDisputeData = async () => {
    setLoading(true);
    try {
      // Load dispute with all related data
      const { data: dispute, error } = await supabase
        .from('disputes')
        .select(`
          *,
          transaction:transactions(*),
          chargeback_actions(*)
        `)
        .eq('id', disputeId)
        .single();

      if (error) throw error;

      // Load messages to get all conversation logs
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', dispute.conversation_id)
        .order('created_at', { ascending: true });

      // Build activities from dispute data with real timestamps
      const activityList: Activity[] = [];

      // Add all messages as activities with proper status determination
      if (messages && messages.length > 0) {
        messages.forEach((message, idx) => {
          const content = message.content.toLowerCase();
          let activityType: Activity['activityType'] = 'message';
          
          // Determine activity type based on message content
          if (message.role === 'user') {
            activityType = 'human_action';
          } else if (content.includes('completed') || content.includes('success') || content.includes('approved')) {
            activityType = 'success';
          } else if (content.includes('needs attention') || content.includes('requires') || content.includes('pending')) {
            activityType = 'needs_attention';
          } else if (content.includes('error') || content.includes('failed')) {
            activityType = 'error';
          } else if (content.includes('work with pace') || content.includes('message from')) {
            activityType = 'message'; // Purple for internal messages
          } else {
            activityType = 'loading'; // Default processing state
          }
          
          activityList.push({
            id: `message-${idx}`,
            timestamp: message.created_at,
            label: message.content,
            reviewer: message.role === 'user' ? 'Customer' : 'System',
            activityType
          });
        });
      }

      // Add chargeback actions
      if (dispute.chargeback_actions && dispute.chargeback_actions.length > 0) {
        dispute.chargeback_actions.forEach((action: any, idx: number) => {
          if (action.action_type === 'validation_recommended') {
            activityList.push({
              id: `action-${idx}-validation`,
              timestamp: action.created_at,
              label: 'Customer validation recommended',
              expandable: true,
              details: action.admin_message || 'Based on transaction history and pattern analysis',
              reviewer: 'Admin',
              activityType: 'message'
            });
          }
          
          if (!action.temporary_credit_issued && action.action_type === 'credit_decision') {
            activityList.push({
              id: `action-${idx}-no-credit`,
              timestamp: action.created_at,
              label: 'Marked as not recommended for temporary credit',
              reviewer: 'Admin',
              activityType: 'human_action'
            });
          }

          if (action.chargeback_filed) {
            activityList.push({
              id: `action-${idx}-filed`,
              timestamp: action.created_at,
              label: `Chargeback filing completed. Ref. no: ${action.id.substring(0, 10)}`,
              attachments: [
                { label: 'View Document', icon: '📄' },
                { label: 'Video Recording', icon: '🎥' }
              ],
              activityType: 'done'
            });
          }
        });
      }

      // Sort by timestamp
      activityList.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

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
    </div>
  );
};

export default ActivityLogView;
