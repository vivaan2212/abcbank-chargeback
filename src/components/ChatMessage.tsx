import { formatDistanceToNow } from "date-fns";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const ChatMessage = ({ role, content, timestamp }: ChatMessageProps) => {
  const isAssistant = role === "assistant";

  return (
    <div className={`flex ${isAssistant ? "justify-start" : "justify-end"} mb-4`}>
      <div className={`max-w-[70%] ${isAssistant ? "items-start" : "items-end"} flex flex-col`}>
        {isAssistant && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
              P
            </div>
            <span className="text-sm font-medium">Pace</span>
          </div>
        )}
        
        <div
          className={`rounded-2xl px-4 py-3 ${
            isAssistant
              ? "bg-[hsl(var(--chat-assistant-bg))] text-foreground rounded-tl-none"
              : "bg-[hsl(var(--chat-user-bg))] text-[hsl(var(--chat-user-fg))] rounded-tr-none"
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{content}</p>
        </div>
        
        <span className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(timestamp, { addSuffix: true })}
        </span>
      </div>
    </div>
  );
};

export default ChatMessage;
