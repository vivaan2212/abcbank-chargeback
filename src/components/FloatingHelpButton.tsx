import { MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import paceAvatar from "@/assets/pace-avatar.png";

interface FloatingHelpButtonProps {
  onClick: () => void;
}

export const FloatingHelpButton = ({ onClick }: FloatingHelpButtonProps) => {
  return (
    <Button
      onClick={onClick}
      className="fixed bottom-6 right-6 w-14 h-14 rounded-full p-0 shadow-lg hover:shadow-xl transition-all hover:scale-105 z-50"
      size="icon"
    >
      <Avatar className="w-10 h-10">
        <AvatarImage src={paceAvatar} alt="Ask Pace" className="object-contain" />
      </Avatar>
    </Button>
  );
};
