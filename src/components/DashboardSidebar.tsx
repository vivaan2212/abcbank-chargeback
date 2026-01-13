import { Database, Users, TrendingUp, ChevronUp, Trash2, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import zampLogo from "@/assets/zamp-icon.svg";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";

interface DashboardSidebarProps {
  activeSection?: string;
  onLogout?: () => void;
}

const DashboardSidebar = ({ activeSection = "chargebacks", onLogout }: DashboardSidebarProps) => {
  const handleClearAllData = async () => {
    if (!confirm('⚠️ WARNING: This will permanently delete ALL disputes, conversations, and messages. This action cannot be undone. Are you absolutely sure?')) {
      return;
    }

    try {
      toast.info('Deleting all data...');
      
      const { data, error } = await supabase.functions.invoke('clear-all-data');
      
      if (error) throw error;
      
      console.log('Deletion result:', data);
      toast.success(`Successfully deleted: ${data.deleted.messages} messages, ${data.deleted.disputes} disputes, ${data.deleted.conversations} conversations`);
      
      // Reload the page to refresh counts
      window.location.reload();
    } catch (error) {
      console.error('Failed to clear data:', error);
      toast.error('Failed to clear all data. Check console for details.');
    }
  };

  return (
    <div className="w-56 h-full flex flex-col bg-sidebar">
      {/* Logo */}
      <div className="p-4 pb-2 flex items-center justify-between">
        <img src={zampLogo} alt="Zamp" className="h-4 w-auto" />
        <ThemeToggle />
      </div>
      
      {/* Data Section */}
      <div className="p-4 pt-2 pb-2">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer">
          <Database className="h-4 w-4" />
          <span className="text-sm">Data</span>
        </div>
      </div>

      {/* People Section */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer">
          <Users className="h-4 w-4" />
          <span className="text-sm">People</span>
        </div>
      </div>

      <Separator className="mx-4 mb-3" />

      {/* Processes Section */}
      <div className="px-4">
        <div className="text-xs font-medium text-muted-foreground mb-2">Processes</div>
        <div className="border rounded-lg bg-card">
          <div 
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 cursor-pointer",
              activeSection === "chargebacks" ? "bg-muted" : "hover:bg-muted/50"
            )}
          >
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm">Chargebacks</span>
          </div>
        </div>
      </div>

      {/* Spacer to push dropdown to bottom */}
      <div className="flex-1" />

      {/* Bank Dropdown at Bottom */}
      <div className="px-4 py-3.5 border-t">
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full">
            <div className="flex items-center justify-between px-2 py-2.5 rounded hover:bg-muted/50 cursor-pointer">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-pink-200 flex items-center justify-center text-sm font-medium">
                  A
                </div>
                <span className="text-sm font-medium">ABC Bank</span>
              </div>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem 
              onClick={handleClearAllData}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Data
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={onLogout}
              className="cursor-pointer"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default DashboardSidebar;
