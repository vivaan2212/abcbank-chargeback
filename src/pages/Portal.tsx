import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getUserRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogOut, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import ChatMessage from "@/components/ChatMessage";
import ChatHistory from "@/components/ChatHistory";
import TransactionList from "@/components/TransactionList";
import { ReasonPicker, ChargebackReason } from "@/components/ReasonPicker";
import { DocumentUpload, UploadedDocument } from "@/components/DocumentUpload";
import { UploadedDocumentsViewer } from "@/components/UploadedDocumentsViewer";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { User, Session } from "@supabase/supabase-js";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  documents?: UploadedDocument[];
}

interface Transaction {
  id: string;
  transaction_id: number;
  transaction_time: string;
  transaction_amount: number;
  transaction_currency: string;
  merchant_name: string;
  merchant_category_code: number;
  acquirer_name: string;
  is_wallet_transaction: boolean;
  wallet_type: string | null;
  secured_indication: number;
  pos_entry_mode: number;
  local_transaction_amount: number;
  local_transaction_currency: string;
}

interface EligibilityResult {
  transactionId: string;
  status: "ELIGIBLE" | "INELIGIBLE";
  ineligibleReasons?: string[];
}

interface AIClassification {
  category: string;
  categoryLabel: string;
  explanation: string;
  documents: { name: string; uploadTypes: string }[];
  userMessage: string;
}

const Portal = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [currentDisputeId, setCurrentDisputeId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showTransactions, setShowTransactions] = useState(false);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [eligibilityResult, setEligibilityResult] = useState<EligibilityResult | null>(null);
  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedReason, setSelectedReason] = useState<ChargebackReason | null>(null);
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [isCheckingDocuments, setIsCheckingDocuments] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [isCheckingRole, setIsCheckingRole] = useState(true);
  const [aiClassification, setAiClassification] = useState<AIClassification | null>(null);
  const [isAnalyzingReason, setIsAnalyzingReason] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasBootstrapped = useRef(false);
  
  useEffect(() => {
    // Set up auth listener FIRST to catch all auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      console.log('Auth event:', event, 'Session valid:', !!currentSession);
      
      // Update session and user state
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      
      // Handle logout event
      if (event === 'SIGNED_OUT') {
        navigate("/login");
      }
      
      // Handle sign in event
      if (event === 'SIGNED_IN' && currentSession?.user) {
        // Defer to avoid race conditions; only create new chat if marked as fresh login via sessionStorage
        setTimeout(() => {
          const fresh = sessionStorage.getItem('portal:freshLogin') === '1';
          if (fresh) {
            sessionStorage.removeItem('portal:freshLogin');
            initializeNewConversation(currentSession.user.id);
          }
        }, 0);
      }
    });

    // Bootstrap only once (avoid double-run in React StrictMode)
    if (!hasBootstrapped.current) {
      hasBootstrapped.current = true;
      
      supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
        if (!currentSession) {
          navigate("/login");
          setIsCheckingRole(false);
        } else {
          // Allow both bank_admin and customer to access Portal
          // Bank admins can view customer experience, customers can use it normally
          setIsCheckingRole(false);
          setSession(currentSession);
          setUser(currentSession.user);
          
          // Fresh login should be indicated via sessionStorage to survive navigation reliably
          const fresh = sessionStorage.getItem('portal:freshLogin') === '1';
          if (fresh) {
            sessionStorage.removeItem('portal:freshLogin');
            initializeNewConversation(currentSession.user.id);
          } else {
            // Try to restore last opened conversation if available and owned by user
            const savedId = localStorage.getItem('portal:currentConversationId');
            if (savedId) {
              const { data: conv } = await supabase
                .from("conversations")
                .select("id,status,user_id")
                .eq("id", savedId)
                .eq("user_id", currentSession.user.id)
                .maybeSingle();
              if (conv) {
                setCurrentConversationId(conv.id);
                setIsReadOnly(conv.status === "closed");
                loadMessages(conv.id);
              } else {
                localStorage.removeItem('portal:currentConversationId');
                loadOrCreateConversation(currentSession.user.id);
              }
            } else {
              loadOrCreateConversation(currentSession.user.id);
            }
          }
        }
      });
    }

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadOrCreateConversation = async (userId: string) => {
    try {
      // First, try to find the most recent conversation (any status)
      const { data: existingConversations, error: fetchError } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      if (existingConversations && existingConversations.length > 0) {
        // Load existing conversation
        const conversation = existingConversations[0];
        setCurrentConversationId(conversation.id);
        localStorage.setItem('portal:currentConversationId', conversation.id);
        setIsReadOnly(conversation.status === "closed");
      // Fetch recent transactions for the user so the list can render immediately
        try {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - 120);
          const { data: txns } = await supabase
            .from("transactions")
            .select("*")
            .eq("customer_id", userId)
            .gte("transaction_time", cutoffDate.toISOString())
            .order("transaction_time", { ascending: false })
            .limit(20);
          setTransactions(txns || []);
        } catch (e) {
          console.error("Failed loading transactions for existing conversation", e);
        }
        
        // Load existing dispute if any
        const { data: existingDispute } = await supabase
          .from("disputes")
          .select("*")
          .eq("conversation_id", conversation.id)
          .maybeSingle();
        
        if (existingDispute) {
          setCurrentDisputeId(existingDispute.id);
        }
        
        loadMessages(conversation.id);
      }
      // If no conversations exist at all, don't create one automatically
      // User needs to click "New Chat" button
    } catch (error: any) {
      console.error("Error loading conversation:", error);
      toast.error("Failed to load conversation");
    }
  };

  useEffect(() => {
    if (currentConversationId) {
      loadMessages(currentConversationId);
      checkConversationStatus(currentConversationId);
      
      // Subscribe to new messages
      const channel = supabase
        .channel(`messages:${currentConversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${currentConversationId}`,
          },
          (payload) => {
            const newMessage = payload.new as Message;
            // Prevent duplicates - only add if message doesn't exist
            setMessages((prev) => {
              const exists = prev.some(msg => msg.id === newMessage.id);
              if (exists) return prev;
              return [...prev, newMessage];
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentConversationId]);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const checkConversationStatus = async (conversationId: string) => {
    const { data } = await supabase
      .from("conversations")
      .select("status")
      .eq("id", conversationId)
      .single();

    setIsReadOnly(data?.status === "closed");
  };

  const initializeNewConversation = async (userId: string) => {
    try {
      // Create new conversation
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          title: "New chat",
          status: "active",
        })
        .select()
        .single();

      if (convError) throw convError;

      setCurrentConversationId(conversation.id);
      localStorage.setItem('portal:currentConversationId', conversation.id);
      setIsReadOnly(false);
      // Reset UI state for a fresh conversation
      setShowTransactions(true);
      setShowReasonPicker(false);
      setShowDocumentUpload(false);
      setEligibilityResult(null);
      setSelectedTransaction(null);
      setSelectedReason(null);
      setIsCheckingDocuments(false);
      setUploadedDocuments([]);
      setAiClassification(null);

      // Create dispute record for dashboard tracking
      const { data: newDispute, error: disputeError } = await supabase
        .from("disputes")
        .insert({
          conversation_id: conversation.id,
          customer_id: userId,
          status: "started"
        })
        .select()
        .single();

      if (disputeError) throw disputeError;
      setCurrentDisputeId(newDispute.id);

      // Get user profile for personalized welcome
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();

      const firstName = profile?.full_name?.split(" ")[0] || "there";

      // Fetch transactions from last 120 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 120);

      const { data: txns, error: txnError } = await supabase
        .from("transactions")
        .select("*")
        .eq("customer_id", userId)
        .gte("transaction_time", cutoffDate.toISOString())
        .order("transaction_time", { ascending: false })
        .limit(20);

      if (txnError) throw txnError;
      setTransactions(txns || []);

      // Add welcome message
      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: `Hi ${firstName}, welcome to ABC Bank.\nI'm your chargeback filing assistant.\nThese are your transactions from the last 120 days — please select the transaction for which you'd like to proceed with filing a chargeback.`,
        });

      if (msgError) throw msgError;
    } catch (error: any) {
      toast.error("Failed to create new conversation");
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      const loaded = (data || []) as Message[];
      setMessages(loaded);

      // Check dispute status for this conversation to determine which UI elements to show
      const { data: dispute } = await supabase
        .from("disputes")
        .select("status")
        .eq("conversation_id", conversationId)
        .maybeSingle();

      if (dispute) {
        // Only show transactions if dispute is in the initial stage
        const shouldShowTransactions = dispute.status === "started";
        const shouldShowReasonPicker = dispute.status === "eligibility_checked";
        const shouldShowDocumentUpload = dispute.status === "reason_selected";

        setShowTransactions(shouldShowTransactions);
        setShowReasonPicker(shouldShowReasonPicker);
        setShowDocumentUpload(shouldShowDocumentUpload);

        // Reset states for completed stages
        if (!shouldShowTransactions) {
          setEligibilityResult(null);
          setSelectedTransaction(null);
        }
        if (!shouldShowDocumentUpload && dispute.status !== "documents_uploaded") {
          setSelectedReason(null);
        }
      } else {
        // If no dispute found but conversation exists, check if it needs transaction selection
        const hasUserSelection = loaded.some(m => m.role === "user" && m.content.startsWith("I'd like to dispute"));
        if (!hasUserSelection) {
          setShowTransactions(true);
          setShowReasonPicker(false);
          setShowDocumentUpload(false);
        } else {
          // Has user selection but no dispute - hide everything
          setShowTransactions(false);
          setShowReasonPicker(false);
          setShowDocumentUpload(false);
        }
      }
    } catch (error: any) {
      toast.error("Failed to load messages");
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !currentConversationId || isSending || isReadOnly) return;

    setIsSending(true);
    const messageContent = inputMessage.trim();
    setInputMessage("");

    try {
      // Insert user message
      const { error: userMsgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: currentConversationId,
          role: "user",
          content: messageContent,
        });

      if (userMsgError) throw userMsgError;

      // Check if user is responding to not_eligible options
      if (messageContent === '1') {
        // User wants to select another transaction
        await supabase
          .from("messages")
          .insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: "Please select another transaction from the list to proceed with filing a chargeback.",
          });
        
        // Ensure transaction list is visible
        setShowTransactions(true);
        setShowReasonPicker(false);
        setShowDocumentUpload(false);
      } else if (messageContent === '2') {
        // User wants to end the chat
        await supabase
          .from("messages")
          .insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: "Thank you for contacting ABC Bank. If you need further assistance, please feel free to start a new chat. Have a great day!",
          });

        // Close the conversation
        await supabase
          .from("conversations")
          .update({ status: "closed" })
          .eq("id", currentConversationId);

        setIsReadOnly(true);
        toast.success("Chat ended successfully");
      } else {
        // Default response for other messages
        setTimeout(async () => {
          const { error: assistantMsgError } = await supabase
            .from("messages")
            .insert({
              conversation_id: currentConversationId,
              role: "assistant",
              content: "Thank you for that information. I'm processing your chargeback request. Could you provide more details about the merchant and transaction date?",
            });

          if (assistantMsgError) throw assistantMsgError;
        }, 500);
      }
    } catch (error: any) {
      toast.error("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleConversationSelect = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    localStorage.setItem('portal:currentConversationId', conversationId);
  };

  const handleNewChat = () => {
    if (user) {
      initializeNewConversation(user.id);
    }
  };

  const handleLogout = async () => {
    try {
      console.log('Attempting logout...');
      
      // Use local-only sign out to avoid server-side session errors
      // This clears local storage without trying to invalidate the session on the server
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      
      if (error) {
        console.error('Logout error:', error);
      }
      
      // Clear local state
      setSession(null);
      setUser(null);
      setUploadedDocuments([]);
      
      toast.success('Logged out successfully');
      navigate("/login");
    } catch (error) {
      console.error('Logout failed:', error);
      // Even on error, clear state and redirect
      setSession(null);
      setUser(null);
      navigate("/login");
    }
  };

  const handleEndSession = async () => {
    if (!currentConversationId) return;

    try {
      // Close current conversation
      await supabase
        .from("conversations")
        .update({ status: "closed" })
        .eq("id", currentConversationId);

      toast.success("Session ended");
      
      // Create new conversation
      if (user) {
        initializeNewConversation(user.id);
      }
    } catch (error: any) {
      toast.error("Failed to end session");
    }
  };

  const handleTransactionSelect = async (transaction: Transaction) => {
    if (!currentConversationId || !currentDisputeId) return;

    try {
      setShowTransactions(false);
      setShowReasonPicker(false);
      setShowDocumentUpload(false);
      setEligibilityResult(null);
      setSelectedTransaction(transaction);
      setSelectedReason(null);
      setUploadedDocuments([]);
      setAiClassification(null);

      // Update dispute with transaction selection
      await supabase
        .from("disputes")
        .update({
          transaction_id: transaction.id,
          status: "transaction_selected"
        })
        .eq("id", currentDisputeId);

      // Add user's selection message
      const userMessage = `I'd like to dispute the ${transaction.merchant_name} transaction on ${format(
        new Date(transaction.transaction_time),
        "dd MMM yyyy"
      )} for ${transaction.transaction_amount.toFixed(2)} ${transaction.transaction_currency}.`;

      const { error: userMsgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: currentConversationId,
          role: "user",
          content: userMessage,
        });

      if (userMsgError) throw userMsgError;

      // Update conversation title
      const newTitle = `${transaction.merchant_name} • ${transaction.transaction_amount.toFixed(2)} ${
        transaction.transaction_currency
      } • ${format(new Date(transaction.transaction_time), "dd MMM")}`;

      await supabase
        .from("conversations")
        .update({ title: newTitle })
        .eq("id", currentConversationId);

      // Show transaction details in assistant message with delay
      setTimeout(async () => {
        const detailsMessage = `Thanks for choosing a transaction. Here are the details I have:

• Merchant: ${transaction.merchant_name}
• Amount: ${transaction.transaction_amount.toFixed(2)} ${transaction.transaction_currency}
• Date: ${format(new Date(transaction.transaction_time), "dd MMM yyyy")}
• MCC: ${transaction.merchant_category_code}
• Acquirer: ${transaction.acquirer_name}
• POS Entry Mode: ${transaction.pos_entry_mode}
• Secured Indication: ${transaction.secured_indication}
• Wallet: ${transaction.is_wallet_transaction ? `Yes${transaction.wallet_type ? ` (${transaction.wallet_type})` : ""}` : "No"}

Let me check if this transaction is eligible for a chargeback...`;

        await supabase
          .from("messages")
          .insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: detailsMessage,
          });

        // Check eligibility after another delay
        setTimeout(() => {
          checkEligibility(transaction);
        }, 500);
      }, 500);
    } catch (error: any) {
      toast.error("Failed to select transaction");
    }
  };

  const checkEligibility = async (transaction: Transaction) => {
    if (!currentConversationId) return;

    setIsCheckingEligibility(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("check-eligibility", {
        body: { transactionId: transaction.id },
      });

      if (response.error) throw response.error;

      const result: EligibilityResult = response.data;
      setEligibilityResult(result);

      // Update dispute with eligibility check results
      if (currentDisputeId) {
        await supabase
          .from("disputes")
          .update({
            eligibility_status: result.status,
            eligibility_reasons: result.ineligibleReasons || [],
            status: result.status === "INELIGIBLE" ? "ineligible" : "eligibility_checked"
          })
          .eq("id", currentDisputeId);
      }

      // Add delay before showing eligibility result
      setTimeout(async () => {
        if (result.status === "INELIGIBLE") {
          // Show ineligibility message with reasons (no settlement log needed)
          const reasonsList = result.ineligibleReasons?.map((r) => `- ${r}`).join("\n") || "";
          const ineligibleMessage = `This transaction isn't eligible for a chargeback right now:\n\n${reasonsList}\n\nYou can select another transaction or end the session.`;

          await supabase
            .from("messages")
            .insert({
              conversation_id: currentConversationId,
              role: "assistant",
              content: ineligibleMessage,
            });
        } else {
          // Show eligibility message
          const eligibleMessage = `This transaction is eligible to proceed!\nPlease choose the reason that best describes your dispute.`;

          await supabase
            .from("messages")
            .insert({
              conversation_id: currentConversationId,
              role: "assistant",
              content: eligibleMessage,
            });

          setTimeout(() => {
            setShowReasonPicker(true);
          }, 500);
        }
      }, 500);
    } catch (error: any) {
      console.error("Eligibility check error:", error);
      toast.error("Failed to check eligibility");
    } finally {
      setIsCheckingEligibility(false);
    }
  };

  const handleReasonSelect = async (reason: ChargebackReason) => {
    if (!currentConversationId || !currentDisputeId) return;

    try {
      setShowReasonPicker(false);
      setSelectedReason(reason);

      // Add user's reason selection message
      const reasonMessage = reason.customReason 
        ? `Reason selected: ${reason.label} - "${reason.customReason}"`
        : `Reason selected: ${reason.label}`;

      await supabase
        .from("messages")
        .insert({
          conversation_id: currentConversationId,
          role: "user",
          content: reasonMessage,
        });

      // If "Other" reason with custom text, analyze with AI
      if (reason.id === "other" && reason.customReason) {
        setIsAnalyzingReason(true);
        
        // Show analyzing message
        await supabase
          .from("messages")
          .insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: "Thank you for providing details. Pace is analyzing your reason to determine the best way to proceed with your chargeback...",
          });

        try {
          const { data: classification, error: aiError } = await supabase.functions.invoke(
            'analyze-custom-reason',
            { body: { customReason: reason.customReason } }
          );

          if (aiError) throw aiError;
          
          setAiClassification(classification);

          // Check if not eligible
          if (classification.category === "not_eligible") {
            await supabase
              .from("disputes")
              .update({
                reason_id: "not_eligible",
                reason_label: classification.categoryLabel,
                custom_reason: reason.customReason,
                status: "not_eligible"
              })
              .eq("id", currentDisputeId);

            // Add AI message explaining why it's not eligible
            await supabase
              .from("messages")
              .insert({
                conversation_id: currentConversationId,
                role: "assistant",
                content: classification.userMessage,
              });

            // Add follow-up message with options
            await supabase
              .from("messages")
              .insert({
                conversation_id: currentConversationId,
                role: "assistant",
                content: "Would you like to:\n1. Select another transaction to dispute\n2. End this chat\n\nPlease type '1' to select another transaction or '2' to end the chat.",
              });

            // Reset state to allow selecting another transaction
            setSelectedTransaction(null);
            setSelectedReason(null);
            setAiClassification(null);
            setUploadedDocuments([]);
            setShowReasonPicker(false);
            setShowDocumentUpload(false);
            setShowTransactions(true);
            
            toast.info("This reason is not eligible for chargeback");
            return;
          }

          // Update dispute with AI-classified reason
          await supabase
            .from("disputes")
            .update({
              reason_id: classification.category,
              reason_label: classification.categoryLabel,
              custom_reason: reason.customReason,
              status: "reason_selected"
            })
            .eq("id", currentDisputeId);

          // Show AI analysis result
          await supabase
            .from("messages")
            .insert({
              conversation_id: currentConversationId,
              role: "assistant",
              content: classification.userMessage,
            });

          setTimeout(() => {
            setShowDocumentUpload(true);
          }, 500);

        } catch (error: any) {
          console.error("AI analysis error:", error);
          toast.error("Failed to analyze reason. Using default document requirements.");
          
          // Fallback to standard "other" documents
          await supabase
            .from("disputes")
            .update({
              reason_id: reason.id,
              reason_label: reason.label,
              custom_reason: reason.customReason,
              status: "reason_selected"
            })
            .eq("id", currentDisputeId);

          await supabase
            .from("messages")
            .insert({
              conversation_id: currentConversationId,
              role: "assistant",
              content: "Thank you for selecting the reason. To proceed with your chargeback, please upload the required supporting documents.",
            });

          setTimeout(() => {
            setShowDocumentUpload(true);
          }, 500);
        } finally {
          setIsAnalyzingReason(false);
        }
      } else {
        // Standard reason selection (non-custom) - clear AI classification
        setAiClassification(null);
        
        await supabase
          .from("disputes")
          .update({
            reason_id: reason.id,
            reason_label: reason.label,
            custom_reason: reason.customReason || null,
            status: "reason_selected"
          })
          .eq("id", currentDisputeId);

        // Add document request message with delay
        setTimeout(async () => {
          const documentRequestMessage = `Thank you for selecting the reason. To proceed with your chargeback, please upload the required supporting documents.`;

          await supabase
            .from("messages")
            .insert({
              conversation_id: currentConversationId,
              role: "assistant",
              content: documentRequestMessage,
            });

          setTimeout(() => {
            setShowDocumentUpload(true);
          }, 500);
        }, 500);
      }
    } catch (error: any) {
      toast.error("Failed to save reason");
      setIsAnalyzingReason(false);
    }
  };

  const handleDocumentsComplete = async (documents: UploadedDocument[]) => {
    if (!currentConversationId || !currentDisputeId) return;

    try {
      // Store uploaded documents in session state
      setUploadedDocuments(documents);
      
      setShowDocumentUpload(false);
      setShowTransactions(false);
      setShowReasonPicker(false);

      // Update dispute with documents
      const documentsData = documents.map(d => ({
        name: d.file.name,
        size: d.file.size,
        type: d.file.type,
        requirementName: d.requirementName
      }));

      await supabase
        .from("disputes")
        .update({
          documents: documentsData,
          status: "documents_uploaded"
        })
        .eq("id", currentDisputeId);

      // Add user message about documents uploaded with document attachments
      const docNames = documents.map(d => d.file.name).join(", ");
      const userMessage = `Uploaded ${documents.length} documents: ${docNames}`;

      const { data: newMessage } = await supabase
        .from("messages")
        .insert({
          conversation_id: currentConversationId,
          role: "user",
          content: userMessage,
        })
        .select()
        .single();

      // Message will be added automatically by realtime subscription

      // Show checking message
      setTimeout(async () => {
        setIsCheckingDocuments(true);

        await supabase
          .from("messages")
          .insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: "Thank you for uploading the required documents. We are now checking if they are valid. Please wait while we verify the documents.",
          });

        toast.success("Documents submitted successfully");

        // Simulate document validation (can be replaced with actual validation)
        setTimeout(async () => {
          setIsCheckingDocuments(false);
          
          // Mark dispute as under review
          if (currentDisputeId) {
            await supabase
              .from("disputes")
              .update({ status: "under_review" })
              .eq("id", currentDisputeId);

            // Close the conversation
            await supabase
              .from("conversations")
              .update({ status: "closed" })
              .eq("id", currentConversationId);

            setIsReadOnly(true);
          }
        }, 3000);
      }, 500);
    } catch (error: any) {
      toast.error("Failed to process documents");
    }
  };

  const handleSelectAnotherTransaction = () => {
    setShowTransactions(true);
    setEligibilityResult(null);
    setSelectedTransaction(null);
    setShowReasonPicker(false);
    setShowDocumentUpload(false);
    setSelectedReason(null);
    setUploadedDocuments([]);
  };

  // Show nothing while checking role to prevent flash
  if (isCheckingRole) {
    return null;
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="h-screen bg-background">
      <ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
        <ChatHistory
          currentConversationId={currentConversationId || undefined}
          onConversationSelect={handleConversationSelect}
          onNewChat={handleNewChat}
        />
      </ResizablePanel>
      
      <ResizableHandle withHandle />
      
      <ResizablePanel defaultSize={80}>
        <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="border-b border-border bg-card px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Chargeback Assistant</h1>
              <p className="text-sm text-muted-foreground">Powered by Pace</p>
            </div>
            <div className="flex items-center gap-2">
              {uploadedDocuments.length > 0 && (
                <UploadedDocumentsViewer documents={uploadedDocuments} />
              )}
              <Button variant="outline" onClick={handleEndSession} disabled={isReadOnly}>
                End Session
              </Button>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>

        {isReadOnly && (
          <div className="bg-muted/50 px-6 py-3 border-b border-border">
            <p className="text-sm text-muted-foreground">
              You are viewing a past conversation. Start a new chat to continue.
            </p>
          </div>
        )}

        {/* Messages - bottom anchored layout */}
        <ScrollArea className="flex-1 px-6 py-4" ref={scrollRef}>
          <div className="max-w-4xl mx-auto min-h-full grid grid-rows-[1fr_auto]">
            <div />
            <div>
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role as "user" | "assistant"}
                  content={message.content}
                  timestamp={new Date(message.created_at)}
                  documents={message.documents}
                />
              ))}
              {isCheckingEligibility && (
                <div className="mt-6 flex items-center justify-center">
                  <Card className="p-6 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Checking eligibility...</span>
                  </Card>
                </div>
              )}
              {isCheckingDocuments && (
                <div className="mt-6 flex items-center justify-center">
                  <Card className="p-6 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Verifying documents...</span>
                  </Card>
                </div>
              )}
              {showTransactions && (
                <div className="mt-6">
                  <TransactionList transactions={transactions} onSelect={handleTransactionSelect} />
                </div>
              )}
              {eligibilityResult?.status === "INELIGIBLE" && !showTransactions && (
                <div className="mt-6">
                  <Card className="p-6 space-y-4">
                    <div className="flex gap-2">
                      <Button onClick={handleSelectAnotherTransaction} variant="default">
                        Select Another Transaction
                      </Button>
                      <Button onClick={handleEndSession} variant="outline">
                        End Session
                      </Button>
                    </div>
                  </Card>
                </div>
              )}
              {showReasonPicker && (
                <div className="mt-6">
                  <ReasonPicker onSelect={handleReasonSelect} />
                </div>
              )}
              {isAnalyzingReason && (
                <div className="mt-6">
                  <Card className="p-6">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <p className="text-sm">Analyzing your reason with AI...</p>
                    </div>
                  </Card>
                </div>
              )}
              {showDocumentUpload && selectedReason && (
                <div className="mt-6">
                  <DocumentUpload
                    reasonId={selectedReason.id}
                    reasonLabel={selectedReason.label}
                    customReason={selectedReason.customReason}
                    aiClassification={aiClassification}
                    onComplete={handleDocumentsComplete}
                  />
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border bg-card px-6 py-4">
          <div className="max-w-4xl mx-auto flex gap-2">
            <Textarea
              placeholder={isReadOnly ? "This conversation is closed" : "Type your message..."}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isSending || isReadOnly}
              className="resize-none"
              rows={3}
            />
            <Button
              onClick={handleSendMessage}
              disabled={isSending || isReadOnly || !inputMessage.trim()}
              size="icon"
              className="h-full aspect-square"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default Portal;
