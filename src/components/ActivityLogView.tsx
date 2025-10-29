import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  timestamp: string;
  label: string;
  expandable?: boolean;
  expanded?: boolean;
  details?: string;
  attachments?: Array<{ label: string; icon: string }>;
  reviewer?: string;
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

  useEffect(() => {
    // Simulate loading with dissolve effect
    setLoading(true);
    const timer = setTimeout(() => {
      // Mock activity data - replace with actual data loading
      setActivities([
        {
          id: "1",
          timestamp: new Date().toISOString(),
          label: "Disputed transaction",
          attachments: [{ label: "Disputed transaction", icon: "📄" }]
        },
        {
          id: "2",
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          label: "Transaction is unsecured",
          expandable: true,
          details: "POS entry mode: 07\nWallet type: None\nSecured indication: 0"
        },
        {
          id: "3",
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          label: "Transaction is settled",
        },
        {
          id: "4",
          timestamp: new Date().toISOString(),
          label: "Customer validation recommended",
          expandable: true,
          details: "Based on transaction history and pattern analysis",
          attachments: [{ label: "Past transactions with me...", icon: "📊" }],
          reviewer: "Rohit Kapoor"
        },
        {
          id: "5",
          timestamp: new Date().toISOString(),
          label: "Marked as not recommended for temporary credit",
          reviewer: "Rohit Kapoor"
        },
        {
          id: "6",
          timestamp: new Date().toISOString(),
          label: "Chargeback filing completed. Ref. no: 9330640080",
          attachments: [
            { label: "View Document", icon: "📄" },
            { label: "Video Recording", icon: "🎥" }
          ]
        }
      ]);
      setLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, [disputeId]);

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

  const groupActivitiesByDate = () => {
    // Sort activities by timestamp descending (newest first)
    const sortedActivities = [...activities].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
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
        sortKey = 0;
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateLabel = "Yesterday";
        sortKey = 1;
      } else {
        dateLabel = format(date, "dd MMM yyyy");
        sortKey = 2 + (today.getTime() - date.getTime()); // Older dates get higher numbers
      }

      if (!groupMap[dateLabel]) {
        groupMap[dateLabel] = [];
        groups.push({ label: dateLabel, activities: groupMap[dateLabel], sortKey });
      }
      groupMap[dateLabel].push(activity);
    });

    // Sort groups by sortKey (Today first, then Yesterday, then older dates)
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
    <div className="h-full flex flex-col animate-fade-in">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
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
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-3xl space-y-8">
          {groupedActivities.map((group) => (
            <div key={group.label}>
              {/* Date Separator */}
              <div className="flex items-center gap-4 mb-6">
                <div className="h-px flex-1 bg-border" />
                <div className="text-sm text-muted-foreground font-medium">{group.label}</div>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Activities for this date */}
              <div className="space-y-6">
                {group.activities.map((activity, index) => (
                  <div key={activity.id} className="flex gap-4">
                    {/* Time */}
                    <div className="text-sm text-muted-foreground w-20 flex-shrink-0 pt-0.5">
                      {format(new Date(activity.timestamp), "h:mm a")}
                    </div>

                    {/* Checkbox */}
                    <div className="flex-shrink-0 pt-0.5">
                      <div className="h-5 w-5 rounded border-2 border-primary bg-background flex items-center justify-center">
                        <div className="h-2 w-2 rounded-sm bg-primary" />
                      </div>
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
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t px-6 py-3 text-sm text-muted-foreground">
        Work with Pace
      </div>
    </div>
  );
};

export default ActivityLogView;
