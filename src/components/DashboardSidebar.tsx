import { Database, Users, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardSidebarProps {
  activeSection?: string;
}

const DashboardSidebar = ({ activeSection = "chargebacks" }: DashboardSidebarProps) => {
  return (
    <div className="w-56 h-full border-r bg-background flex flex-col">
      {/* Data Section */}
      <div className="p-4">
        <div className="text-xs font-medium text-muted-foreground mb-2">Data</div>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer">
          <Database className="h-4 w-4" />
          <span className="text-sm">Data</span>
        </div>
      </div>

      {/* People Section */}
      <div className="px-4 pb-4">
        <div className="text-xs font-medium text-muted-foreground mb-2">People</div>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer">
          <Users className="h-4 w-4" />
          <span className="text-sm">People</span>
        </div>
      </div>

      {/* Processes Section */}
      <div className="px-4">
        <div className="text-xs font-medium text-muted-foreground mb-2">Processes</div>
        <div 
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer",
            activeSection === "chargebacks" ? "bg-muted" : "hover:bg-muted/50"
          )}
        >
          <TrendingUp className="h-4 w-4" />
          <span className="text-sm">Chargebacks</span>
        </div>
      </div>
    </div>
  );
};

export default DashboardSidebar;
