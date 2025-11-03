import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getUserRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogOut, Send, ArrowUp, Menu, X, MessageCircleQuestion } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import ChatMessage from "@/components/ChatMessage";
import ChatHistory from "@/components/ChatHistory";
import TransactionList from "@/components/TransactionList";
import { ReasonPicker, ChargebackReason } from "@/components/ReasonPicker";
import { DocumentUpload, UploadedDocument, DOCUMENT_REQUIREMENTS } from "@/components/DocumentUpload";
import { UploadedDocumentsViewer } from "@/components/UploadedDocumentsViewer";
import ArtifactsViewer, { ArtifactDoc } from "@/components/ArtifactsViewer";
import { PreviewPane } from "@/components/PreviewPane";
import { HelpWidget } from "@/components/HelpWidget";
import { CustomerEvidenceUpload } from "@/components/CustomerEvidenceUpload";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { LoadingText } from "@/components/LoadingText";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import type { User, Session } from "@supabase/supabase-js";
import paceAvatar from "@/assets/pace-avatar.png";

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
  const [isSwitchingConversation, setIsSwitchingConversation] = useState(false);
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
  const [needsReupload, setNeedsReupload] = useState(false);
  const [isCheckingDocuments, setIsCheckingDocuments] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactDoc[]>([]);
  const [isCheckingRole, setIsCheckingRole] = useState(true);
  const [aiClassification, setAiClassification] = useState<AIClassification | null>(null);
  const [isAnalyzingReason, setIsAnalyzingReason] = useState(false);
  const [showContinueOrEndButtons, setShowContinueOrEndButtons] = useState(false);
  const [showOrderDetailsInput, setShowOrderDetailsInput] = useState(false);
  const [orderDetails, setOrderDetails] = useState("");
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [questionStep, setQuestionStep] = useState<1 | 2 | 3 | null>(null);
  const [answer1, setAnswer1] = useState("");
  const [answer2, setAnswer2] = useState("");
  const [answer3, setAnswer3] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const [precheckResult, setPrecheckResult] = useState<{ chargeback_possible: boolean; reasoning: string; customer_message: string } | null>(null);
  const [isHelpWidgetOpen, setIsHelpWidgetOpen] = useState(false);
  const [helpWidgetMessages, setHelpWidgetMessages] = useState<Array<{ role: "user" | "assistant"; content: string; timestamp: Date }>>([
    {
      role: "assistant",
      content: "I'm here to help! Ask me any question about the current step or the onboarding process.",
      timestamp: new Date(),
    }
  ]);
  const [awaitingEvidenceTransaction, setAwaitingEvidenceTransaction] = useState<Transaction | null>(null);
  const [previewPaneOpen, setPreviewPaneOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<{
    url: string;
    extractedFields: Array<{ label: string; value: string }>;
  } | null>(null);
  
  const [userFirstName, setUserFirstName] = useState("there");
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasBootstrapped = useRef(false);
  const isCreatingChat = useRef(false);
  const inputDraftTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Persist UI interaction state to sessionStorage
  const saveUIState = (chatId: string) => {
    if (!chatId) return;
    
    const uiState = {
      showTransactions,
      showReasonPicker,
      showDocumentUpload,
      showOrderDetailsInput,
      showContinueOrEndButtons,
      needsReupload,
      inputMessage,
      orderDetails,
      selectedTransaction,
      selectedReason,
      eligibilityResult,
      uploadedDocuments,
      artifacts,
      aiClassification,
      questionStep,
      answer1,
      answer2,
      answer3,
      currentQuestion,
      precheckResult,
      timestamp: new Date().toISOString()
    };
    
    sessionStorage.setItem(`cb_ui::${chatId}`, JSON.stringify(uiState));
  };
  
  // Restore UI interaction state from sessionStorage
  const restoreUIState = (chatId: string): boolean => {
    if (!chatId) return false;
    
    const stored = sessionStorage.getItem(`cb_ui::${chatId}`);
    if (!stored) return false;
    
    try {
      const uiState = JSON.parse(stored);
      
      // Only restore if timestamp is recent (within 1 hour)
      const stateAge = Date.now() - new Date(uiState.timestamp).getTime();
      if (stateAge > 3600000) {
        sessionStorage.removeItem(`cb_ui::${chatId}`);
        return false;
      }
      
      // Restore UI state
      if (uiState.showTransactions !== undefined) setShowTransactions(uiState.showTransactions);
      if (uiState.showReasonPicker !== undefined) setShowReasonPicker(uiState.showReasonPicker);
      if (uiState.showDocumentUpload !== undefined) setShowDocumentUpload(uiState.showDocumentUpload);
      if (uiState.showOrderDetailsInput !== undefined) setShowOrderDetailsInput(uiState.showOrderDetailsInput);
      if (uiState.showContinueOrEndButtons !== undefined) setShowContinueOrEndButtons(uiState.showContinueOrEndButtons);
      if (uiState.needsReupload !== undefined) setNeedsReupload(uiState.needsReupload);
      if (uiState.inputMessage) setInputMessage(uiState.inputMessage);
      if (uiState.orderDetails) setOrderDetails(uiState.orderDetails);
      if (uiState.selectedTransaction) setSelectedTransaction(uiState.selectedTransaction);
      if (uiState.selectedReason) setSelectedReason(uiState.selectedReason);
      if (uiState.eligibilityResult) setEligibilityResult(uiState.eligibilityResult);
      if (uiState.uploadedDocuments) setUploadedDocuments(uiState.uploadedDocuments);
      if (uiState.artifacts) setArtifacts(uiState.artifacts);
      if (uiState.aiClassification) setAiClassification(uiState.aiClassification);
      if (uiState.questionStep) setQuestionStep(uiState.questionStep);
      if (uiState.answer1) setAnswer1(uiState.answer1);
      if (uiState.answer2) setAnswer2(uiState.answer2);
      if (uiState.answer3) setAnswer3(uiState.answer3);
      if (uiState.currentQuestion) setCurrentQuestion(uiState.currentQuestion);
      if (uiState.precheckResult) setPrecheckResult(uiState.precheckResult);
      
      return true;
    } catch (e) {
      console.error('Failed to restore UI state:', e);
      return false;
    }
  };
  
  
  // Auto-save UI state when interaction state changes
  useEffect(() => {
    if (currentConversationId && !isSwitchingConversation) {
      // Debounce save to avoid excessive writes
      const timer = setTimeout(() => {
        saveUIState(currentConversationId);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [
    currentConversationId,
    showTransactions,
    showReasonPicker,
    showDocumentUpload,
    showOrderDetailsInput,
    showContinueOrEndButtons,
    needsReupload,
    inputMessage,
    orderDetails,
    selectedTransaction,
    selectedReason,
    eligibilityResult,
    uploadedDocuments,
    artifacts,
    aiClassification,
    questionStep,
    answer1,
    answer2,
    answer3,
    currentQuestion,
    precheckResult,
    isSwitchingConversation
  ]);
  
  // Handle visibility changes - preserve UI without re-evaluation
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Save current state before hiding
        if (currentConversationId) {
          saveUIState(currentConversationId);
        }
      } else {
        // Restored visibility - do NOT trigger re-evaluation or refetch
        // UI state is already persisted and will remain as-is
        console.log('Tab visible again - UI state preserved');
      }
    };
    
    const handleBlur = () => {
      // Save state on blur
      if (currentConversationId) {
        saveUIState(currentConversationId);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [currentConversationId]);
  
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
    });

    // Bootstrap only once (avoid double-run in React StrictMode)
    if (!hasBootstrapped.current) {
      hasBootstrapped.current = true;
      
      supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
        if (!currentSession) {
          navigate("/login");
          setIsCheckingRole(false);
        } else {
          setIsCheckingRole(false);
          setSession(currentSession);
          setUser(currentSession.user);
          
          const userId = currentSession.user.id;
          
          // Fetch user's first name for personalization
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", userId)
            .single();
          
          const firstName = profile?.full_name?.split(" ")[0] || "there";
          setUserFirstName(firstName);
          
          // Check for fresh login flag
          const freshLoginFlag = sessionStorage.getItem('portal:freshLogin');
          if (freshLoginFlag === '1') {
            sessionStorage.removeItem('portal:freshLogin');
            initializeNewConversation(userId);
            return;
          }
          
          // Check for ?newChat=1 in URL to force new chat creation
          const urlParams = new URLSearchParams(location.search);
          if (urlParams.get('newChat') === '1') {
            // Remove param from URL
            urlParams.delete('newChat');
            const newUrl = `${location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;
            window.history.replaceState({}, '', newUrl);
            
            initializeNewConversation(userId);
            return;
          }
          
          // Try to restore active chat from sessionStorage
          const activeChatKey = `cb_active_chat_id::${userId}`;
          const savedChatId = sessionStorage.getItem(activeChatKey);
          
          if (savedChatId) {
            // Validate saved chat exists and belongs to user
            const { data: conv } = await supabase
              .from("conversations")
              .select("id,status,user_id")
              .eq("id", savedChatId)
              .eq("user_id", userId)
              .maybeSingle();
              
            if (conv) {
              // Restore the saved chat
              setCurrentConversationId(conv.id);
              setIsReadOnly(conv.status === "closed");
              loadMessages(conv.id);
              return;
            } else {
              // Saved chat not found, clear it
              sessionStorage.removeItem(activeChatKey);
              sessionStorage.removeItem(`cb_active_chat_ts::${userId}`);
            }
          }
          
          // No saved chat or invalid - check if any conversations exist
          const { data: existingConversations } = await supabase
            .from("conversations")
            .select("*")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .limit(1);
          
          if (existingConversations && existingConversations.length > 0) {
            // Load most recent conversation
            const conversation = existingConversations[0];
            setCurrentConversationId(conversation.id);
            
            // Persist to sessionStorage
            sessionStorage.setItem(activeChatKey, conversation.id);
            sessionStorage.setItem(`cb_active_chat_ts::${userId}`, new Date().toISOString());
            
            setIsReadOnly(conversation.status === "closed");
            loadMessages(conversation.id);
          } else {
            // No conversations exist - don't auto-create; wait briefly and re-check once
            setTimeout(async () => {
              const { data: convs } = await supabase
                .from("conversations")
                .select("*")
                .eq("user_id", userId)
                .order("updated_at", { ascending: false })
                .limit(1);
              if (convs && convs.length > 0) {
                const conversation = convs[0];
                setCurrentConversationId(conversation.id);
                sessionStorage.setItem(activeChatKey, conversation.id);
                sessionStorage.setItem(`cb_active_chat_ts::${userId}`, new Date().toISOString());
                setIsReadOnly(conversation.status === "closed");
                loadMessages(conversation.id);
              } else {
                console.log('No existing conversations; awaiting user action');
              }
            }, 1000);
          }
        }
      });
    }

    return () => subscription.unsubscribe();
  }, [navigate, location.search]);

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
    // Auto-scroll to bottom when messages change with smooth animation
    // ScrollArea uses Radix UI which has a nested viewport element
    if (scrollRef.current) {
      // Find the viewport element inside ScrollArea (it's the actual scrollable element)
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
      if (viewport) {
        // Use requestAnimationFrame for smoother scrolling
        requestAnimationFrame(() => {
          viewport.scrollTo({
            top: viewport.scrollHeight,
            behavior: 'smooth'
          });
        });
      }
    }
  }, [messages, helpWidgetMessages, showTransactions, showReasonPicker, showDocumentUpload, showOrderDetailsInput, showContinueOrEndButtons, isCheckingEligibility, isCheckingDocuments, isAnalyzingReason]);

  const checkConversationStatus = async (conversationId: string) => {
    const { data } = await supabase
      .from("conversations")
      .select("status")
      .eq("id", conversationId)
      .single();

    setIsReadOnly(data?.status === "closed");
  };

  const initializeNewConversation = async (userId: string) => {
    // Guard against duplicate creation within this component instance
    if (isCreatingChat.current) {
      console.log('Chat creation already in progress, skipping...');
      return;
    }

    // Cross-instance idempotency lock (handles React.StrictMode double-mount)
    const lockKey = `cb_chat_creation_lock::${userId}`;
    const now = Date.now();
    const existingLock = sessionStorage.getItem(lockKey);
    if (existingLock && now - parseInt(existingLock, 10) < 10000) {
      console.log('Recent chat creation lock present, skipping...');
      return;
    }
    sessionStorage.setItem(lockKey, String(now));

    isCreatingChat.current = true;

    try {
      // Double-check on the server: reuse a very recent conversation if one exists
      const recentCutoff = new Date(now - 10000).toISOString();
      const { data: recentConvs } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", recentCutoff)
        .order("created_at", { ascending: false })
        .limit(1);

      if (recentConvs && recentConvs.length > 0) {
        const recent = recentConvs[0];
        setCurrentConversationId(recent.id);

        // Persist to sessionStorage (per-user)
        const activeChatKey = `cb_active_chat_id::${userId}`;
        const activeTimestampKey = `cb_active_chat_ts::${userId}`;
        sessionStorage.setItem(activeChatKey, recent.id);
        sessionStorage.setItem(activeTimestampKey, new Date().toISOString());

        setIsReadOnly(recent.status === "closed");
        loadMessages(recent.id);
        return; // Reuse recent conversation, avoid creating a duplicate
      }

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

      // Reset help widget for new conversation
      setIsHelpWidgetOpen(false);
      setHelpWidgetMessages([
        {
          role: "assistant",
          content: "I'm here to help! Ask me any question about the current step or the onboarding process.",
          timestamp: new Date(),
        }
      ]);

      // Persist to sessionStorage (per-user)
      const activeChatKey = `cb_active_chat_id::${userId}`;
      const activeTimestampKey = `cb_active_chat_ts::${userId}`;
      sessionStorage.setItem(activeChatKey, conversation.id);
      sessionStorage.setItem(activeTimestampKey, new Date().toISOString());

      setIsReadOnly(false);
      // Reset UI state for a fresh conversation
      setShowTransactions(false);
      setShowReasonPicker(false);
      setShowDocumentUpload(false);
      setNeedsReupload(false);
      setEligibilityResult(null);
      setSelectedTransaction(null);
      setSelectedReason(null);
      setIsCheckingDocuments(false);
      setUploadedDocuments([]);
      setArtifacts([]);
      setAiClassification(null);
      setQuestionStep(null);
      setAnswer1("");
      setAnswer2("");
      setAnswer3("");
      setCurrentQuestion("");
      setPrecheckResult(null);
      setShowContinueOrEndButtons(false);
      setShowOrderDetailsInput(false);
      setOrderDetails("");

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

      // Check if user is bank admin
      const userRole = await getUserRole(userId);
      const isBankAdmin = userRole === 'bank_admin';

      // Fetch transactions from last 120 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 120);

      // Bank admins see all transactions, regular users see only their own
      let transactionQuery = supabase
        .from("transactions")
        .select("*");

      if (!isBankAdmin) {
        transactionQuery = transactionQuery.eq("customer_id", userId);
      }

      const { data: txns, error: txnError } = await transactionQuery
        .gte("transaction_time", cutoffDate.toISOString())
        .order("transaction_time", { ascending: false })
        .limit(20);

      if (txnError) throw txnError;
      setTransactions(txns || []);

      // Add welcome messages
      const { error: msgError1 } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: `**Hi ${firstName}, welcome to ABC Bank!**\nI'm Pace, your Chargeback Filing assistant.`,
        });

      if (msgError1) throw msgError1;

      const { error: msgError2 } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: `These are your transactions from the last 120 days - please select the transaction for which you'd like to raise a dispute.`,
        });

      if (msgError2) throw msgError2;
    } catch (error: any) {
      toast.error("Failed to create new conversation");
    } finally {
      // Release lock shortly after to allow user-triggered new chats
      setTimeout(() => sessionStorage.removeItem(lockKey), 5000);
      isCreatingChat.current = false;
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      setIsSwitchingConversation(true);
      
      // Try to restore UI state first
      const restoredUI = restoreUIState(conversationId);
      
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      const loaded = (data || []) as Message[];
      setMessages(loaded);

      // Load transactions for this conversation's user
      const { data: conversation } = await supabase
        .from("conversations")
        .select("user_id")
        .eq("id", conversationId)
        .maybeSingle();
      
      if (conversation) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 120);
        
        // Check if user is bank admin
        const userRole = await getUserRole(conversation.user_id);
        const isBankAdmin = userRole === 'bank_admin';
        
        // Bank admins see all transactions, regular users see only their own
        let transactionQuery = supabase
          .from("transactions")
          .select("*");
        
        if (!isBankAdmin) {
          transactionQuery = transactionQuery.eq("customer_id", conversation.user_id);
        }
        
        const { data: txns } = await transactionQuery
          .gte("transaction_time", cutoffDate.toISOString())
          .order("transaction_time", { ascending: false })
          .limit(20);
        setTransactions(txns || []);
        
        // CRITICAL: Only check for awaiting evidence if there's an active dispute in THIS conversation
        const { data: dispute } = await supabase
          .from("disputes")
          .select("id, transaction_id, status")
          .eq("conversation_id", conversationId)
          .maybeSingle();
        
        // Evidence upload should ONLY appear if:
        // 1. There's a dispute for this conversation
        // 2. The dispute has a selected transaction
        // 3. That transaction's dispute_status is "awaiting_customer_info"
        // 4. The representment status confirms merchant has challenged
        if (dispute && dispute.transaction_id) {
          const transaction = txns?.find(t => t.id === dispute.transaction_id);
          
          if (transaction && transaction.dispute_status === "awaiting_customer_info") {
            // Double-check there's an actual representment request
            const { data: representment } = await supabase
              .from("chargeback_representment_static")
              .select("representment_status")
              .eq("transaction_id", transaction.id)
              .maybeSingle();
            
            // Only show evidence upload if representment exists and is awaiting customer info
            if (representment && representment.representment_status === "awaiting_customer_info") {
              setAwaitingEvidenceTransaction(transaction);
            } else {
              setAwaitingEvidenceTransaction(null);
            }
          } else {
            setAwaitingEvidenceTransaction(null);
          }
        } else {
          setAwaitingEvidenceTransaction(null);
        }
      }

      // Only load dispute state if UI wasn't restored from cache
      if (!restoredUI) {
        // Check dispute status for this conversation to determine which UI elements to show
        const { data: dispute } = await supabase
          .from("disputes")
          .select("*")
          .eq("conversation_id", conversationId)
          .maybeSingle();

        if (dispute) {
          setCurrentDisputeId(dispute.id);
          
          // Restore transaction if exists
          if (dispute.transaction_id) {
            const { data: txn } = await supabase
              .from("transactions")
              .select("*")
              .eq("id", dispute.transaction_id)
              .maybeSingle();
            
            if (txn) {
              setSelectedTransaction(txn as Transaction);
            }
          } else {
            setSelectedTransaction(null);
          }
          
          // Restore eligibility result if exists
          if (dispute.eligibility_status) {
            setEligibilityResult({
              transactionId: dispute.transaction_id || "",
              status: dispute.eligibility_status as "ELIGIBLE" | "INELIGIBLE",
              ineligibleReasons: dispute.eligibility_reasons || undefined
            });
          } else {
            setEligibilityResult(null);
          }
          
          // Restore selected reason if exists
          if (dispute.reason_id || dispute.reason_label) {
            setSelectedReason({
              id: dispute.reason_id || "other",
              label: dispute.reason_label || "Other",
              customReason: dispute.custom_reason || undefined
            });
          } else {
            setSelectedReason(null);
          }
          
          // Restore order details if exists
          if (dispute.order_details) {
            setOrderDetails(dispute.order_details);
          } else {
            setOrderDetails("");
          }
          
          // Restore uploaded documents from dispute if exists
          if (dispute.documents) {
            // Convert stored document metadata back to ArtifactDoc format
            const storedArtifacts = (dispute.documents as any[])?.map(doc => ({
              requirementName: doc.requirementName,
              name: doc.name,
              size: doc.size,
              type: doc.type,
              path: doc.path
            })).filter(doc => doc.path) || [];
            
            setArtifacts(storedArtifacts);
            setUploadedDocuments([]);
          } else {
            setUploadedDocuments([]);
            setArtifacts([]);
          }
          
          // Determine which UI elements to show based on status
          const shouldShowTransactions = dispute.status === "started";
          const shouldShowReasonPicker = dispute.status === "eligibility_checked" || dispute.status === "precheck_passed";
          const shouldShowDocumentUpload = dispute.status === "reason_selected";
          const shouldShowOrderInput = dispute.status === "awaiting_order_details";
          
          // Hide all UI elements for final/completed states
          const isFinalState = [
            "awaiting_investigation", 
            "chargeback_filed",
            "awaiting_merchant_refund",
            "awaiting_settlement",
            "pending_manual_review",
            "expired",
            "closed",
            "approved",
            "denied",
            "write_off_approved"
          ].includes(dispute.status);
          
          const shouldShowContinueButtons = dispute.status === "documents_uploaded" && !isFinalState;

          setShowTransactions(shouldShowTransactions && !isFinalState);
          setShowReasonPicker(shouldShowReasonPicker && !isFinalState);
          setShowDocumentUpload(shouldShowDocumentUpload && !isFinalState);
          setShowOrderDetailsInput(shouldShowOrderInput && !isFinalState);
          setShowContinueOrEndButtons(shouldShowContinueButtons);
          
          // Reset analyzing state
          setIsAnalyzingReason(false);
          setIsCheckingDocuments(false);
          setIsCheckingEligibility(false);
        } else {
          // If no dispute found but conversation exists, check if it needs transaction selection
          const hasUserSelection = loaded.some(m => m.role === "user" && m.content.startsWith("I'd like to dispute"));
          if (!hasUserSelection) {
            setShowTransactions(false);
            setShowReasonPicker(false);
            setShowDocumentUpload(false);
            setShowOrderDetailsInput(false);
            setShowContinueOrEndButtons(false);
          } else {
            // Has user selection but no dispute - hide everything
            setShowTransactions(false);
            setShowReasonPicker(false);
            setShowDocumentUpload(false);
            setShowOrderDetailsInput(false);
            setShowContinueOrEndButtons(false);
          }
          
          // Reset all states
          setSelectedTransaction(null);
          setEligibilityResult(null);
          setSelectedReason(null);
          setUploadedDocuments([]);
          setArtifacts([]);
          setOrderDetails("");
          setAiClassification(null);
        }
      }
    } catch (error: any) {
      toast.error("Failed to load messages");
    } finally {
      setIsSwitchingConversation(false);
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

      // If we were awaiting a re-upload, any user message counts as a response; hide uploader
      if (needsReupload) {
        setNeedsReupload(false);
        setShowDocumentUpload(false);
      }
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
        // Check if dispute is in a final state
        let shouldSendClosingMessage = false;
        if (currentDisputeId) {
          const { data: dispute } = await supabase
            .from("disputes")
            .select("status")
            .eq("id", currentDisputeId)
            .maybeSingle();
          
          const finalStates = [
            "approved",
            "pending", 
            "denied",
            "awaiting_investigation", 
            "chargeback_filed",
            "awaiting_merchant_refund",
            "awaiting_settlement",
            "pending_manual_review",
            "expired",
            "closed"
          ];
          
          shouldSendClosingMessage = dispute && finalStates.includes(dispute.status);
        }
        
        // Send appropriate response
        setTimeout(async () => {
          const responseContent = shouldSendClosingMessage
            ? "I hope I have answered your questions well. We will keep you updated with your chargeback status."
            : "Thank you for that information. I'm processing your chargeback request. Could you provide more details about the merchant and transaction date?";
          
          const { error: assistantMsgError } = await supabase
            .from("messages")
            .insert({
              conversation_id: currentConversationId,
              role: "assistant",
              content: responseContent,
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
    // Show loading state and clear everything immediately
    setIsSwitchingConversation(true);
    setMessages([]);
    setShowTransactions(false);
    setShowReasonPicker(false);
    setShowDocumentUpload(false);
    setNeedsReupload(false);
    setShowOrderDetailsInput(false);
    setShowContinueOrEndButtons(false);
    setSelectedTransaction(null);
    setEligibilityResult(null);
    setSelectedReason(null);
    setUploadedDocuments([]);
    setArtifacts([]);
    setOrderDetails("");
      setAiClassification(null);
      setIsAnalyzingReason(false);
      setIsCheckingDocuments(false);
      setIsCheckingEligibility(false);
      setQuestionStep(null);
      setAnswer1("");
      setAnswer2("");
      setAnswer3("");
      setCurrentQuestion("");
      setPrecheckResult(null);
      setIsGeneratingQuestion(false);
    
    // Then update conversation and load new data
    setCurrentConversationId(conversationId);
    
    // Persist to sessionStorage (per-user)
    if (user) {
      const activeChatKey = `cb_active_chat_id::${user.id}`;
      const activeTimestampKey = `cb_active_chat_ts::${user.id}`;
      sessionStorage.setItem(activeChatKey, conversationId);
      sessionStorage.setItem(activeTimestampKey, new Date().toISOString());
    }
  };

  const handleNewChat = () => {
    if (user && !isCreatingChat.current) {
      // Reset help widget when starting new chat
      setIsHelpWidgetOpen(false);
      setHelpWidgetMessages([
        {
          role: "assistant",
          content: "I'm here to help! Ask me any question about the current step or the onboarding process.",
          timestamp: new Date(),
        }
      ]);
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
      setArtifacts([]);
      
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
      setArtifacts([]);
      setAiClassification(null);
      setOrderDetails("");
      setShowOrderDetailsInput(false);
      setQuestionStep(null);
      setAnswer1("");
      setAnswer2("");
      setAnswer3("");
      setCurrentQuestion("");
      setPrecheckResult(null);

      // Update dispute with transaction selection
      const { error: updateError } = await supabase
        .from("disputes")
        .update({
          transaction_id: transaction.id,
          status: "transaction_selected"
        })
        .eq("id", currentDisputeId);

      if (updateError) throw updateError;

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
          // Show ineligibility message with reasons - this should be the final message
          const reasonsList = result.ineligibleReasons?.map((r) => `- ${r}`).join("\n") || "";
          const ineligibleMessage = `This transaction isn't eligible for a chargeback right now:\n\n${reasonsList}`;

          await supabase
            .from("messages")
            .insert({
              conversation_id: currentConversationId,
              role: "assistant",
              content: ineligibleMessage,
            });
          
          // Do NOT show any UI elements or allow any further interaction
          // The dispute is now in terminal "ineligible" state
          // No transaction list, no buttons - conversation ends here for this dispute
        } else {
          // Start the 3-question AI conversation
          const eligibleMessage = `Thank you for selecting your transaction. We have checked the eligibility, and this transaction is eligible for a chargeback.\n\nTo help us understand your situation better, I'll need to ask you a few questions.`;

          await supabase
            .from("messages")
            .insert({
              conversation_id: currentConversationId,
              role: "assistant",
              content: eligibleMessage,
            });

          // Start question 1 after delay
          setTimeout(async () => {
            const q1 = "Could you please tell us what this transaction was about and what went wrong?";
            await supabase
              .from("messages")
              .insert({
                conversation_id: currentConversationId,
                role: "assistant",
                content: q1,
              });
            
            setCurrentQuestion(q1);
            setQuestionStep(1);
            setShowOrderDetailsInput(true);
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

  const handleOrderDetailsSubmit = async () => {
    if (!currentConversationId || !currentDisputeId || !orderDetails.trim()) return;

    try {
      // Add user's answer message
      await supabase
        .from("messages")
        .insert({
          conversation_id: currentConversationId,
          role: "user",
          content: orderDetails,
        });

      setShowOrderDetailsInput(false);

      if (questionStep === 1) {
        // Store answer 1 and generate question 2
        setAnswer1(orderDetails);
        setIsGeneratingQuestion(true);

        // Call edge function to generate Q2
        const { data: q2Data, error: q2Error } = await supabase.functions.invoke(
          'chargeback-precheck',
          {
            body: {
              step: 'generate_q2',
              answer1: orderDetails,
              merchantName: selectedTransaction?.merchant_name,
              transactionAmount: `${selectedTransaction?.transaction_amount} ${selectedTransaction?.transaction_currency}`,
              transactionDate: selectedTransaction?.transaction_time ? format(new Date(selectedTransaction.transaction_time), "dd MMM yyyy") : ''
            }
          }
        );

        setIsGeneratingQuestion(false);

        if (q2Error) throw q2Error;

        // Show Q2 to user
        await supabase
          .from("messages")
          .insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: q2Data.question,
          });

        setCurrentQuestion(q2Data.question);
        setQuestionStep(2);
        setOrderDetails("");
        setTimeout(() => {
          setShowOrderDetailsInput(true);
        }, 300);

      } else if (questionStep === 2) {
        // Store answer 2 and generate question 3
        setAnswer2(orderDetails);
        setIsGeneratingQuestion(true);

        // Call edge function to generate Q3
        const { data: q3Data, error: q3Error } = await supabase.functions.invoke(
          'chargeback-precheck',
          {
            body: {
              step: 'generate_q3',
              answer1: answer1,
              answer2: orderDetails,
              merchantName: selectedTransaction?.merchant_name,
              transactionAmount: `${selectedTransaction?.transaction_amount} ${selectedTransaction?.transaction_currency}`,
              transactionDate: selectedTransaction?.transaction_time ? format(new Date(selectedTransaction.transaction_time), "dd MMM yyyy") : ''
            }
          }
        );

        setIsGeneratingQuestion(false);

        if (q3Error) throw q3Error;

        // Show Q3 to user
        await supabase
          .from("messages")
          .insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: q3Data.question,
          });

        setCurrentQuestion(q3Data.question);
        setQuestionStep(3);
        setOrderDetails("");
        setTimeout(() => {
          setShowOrderDetailsInput(true);
        }, 300);

      } else if (questionStep === 3) {
        // Store answer 3 and evaluate
        setAnswer3(orderDetails);
        setIsGeneratingQuestion(true);

        await supabase
          .from("messages")
          .insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: "Thank you for providing all the details. Let me review your situation...",
          });

        // Call edge function to evaluate all 3 answers
        const { data: evaluation, error: evalError } = await supabase.functions.invoke(
          'chargeback-precheck',
          {
            body: {
              step: 'evaluate',
              answer1: answer1,
              answer2: answer2,
              answer3: orderDetails,
              merchantName: selectedTransaction?.merchant_name,
              transactionAmount: `${selectedTransaction?.transaction_amount} ${selectedTransaction?.transaction_currency}`,
              transactionDate: selectedTransaction?.transaction_time ? format(new Date(selectedTransaction.transaction_time), "dd MMM yyyy") : ''
            }
          }
        );

        setIsGeneratingQuestion(false);

        if (evalError) throw evalError;

        setPrecheckResult(evaluation);

        // Store all answers in dispute record
        const allAnswers = `Q1: Could you please tell us what this transaction was about and what went wrong?\nA1: ${answer1}\n\nQ2: ${currentQuestion}\nA2: ${answer2}\n\nQ3: [dynamic]\nA3: ${orderDetails}`;
        
        await supabase
          .from("disputes")
          .update({
            order_details: allAnswers,
            status: evaluation.chargeback_possible ? "precheck_passed" : "precheck_failed"
          })
          .eq("id", currentDisputeId);

        // Show result to customer
        const sanitizedMessage = (evaluation.customer_message || "").replace(/There is nothing further[^.]*\./i, "").trim();

        const nextStepsMessage = `${sanitizedMessage ? sanitizedMessage + "\n\n" : ""}Next, please select a chargeback reason below so we can capture the required details and documents.`;

        await supabase
          .from("messages")
          .insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: nextStepsMessage,
          });

        if (evaluation.chargeback_possible) {
          // Proceed to reason picker
          setTimeout(() => {
            setQuestionStep(null);
            setCurrentQuestion("");
            setShowReasonPicker(true);
          }, 500);
        } else {
          // End the flow - chargeback not possible
          setQuestionStep(null);
          setCurrentQuestion("");
          // Conversation ends here
        }
      }
    } catch (error: any) {
      console.error("Failed to submit answer:", error);
      toast.error("Failed to submit answer");
      setIsGeneratingQuestion(false);
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
            { 
              body: { 
                customReason: reason.customReason,
                orderDetails: orderDetails,
                merchantName: selectedTransaction?.merchant_name 
              } 
            }
          );

          if (aiError) throw aiError;
          
          setAiClassification(classification);

          // Check if not eligible or details don't match
          if (classification.category === "not_eligible" || classification.category === "mismatch") {
            const statusToSet = classification.category === "mismatch" ? "mismatch" : "not_eligible";
            
            const { error: updateError } = await supabase
              .from("disputes")
              .update({
                reason_id: classification.category,
                reason_label: classification.categoryLabel,
                custom_reason: reason.customReason,
                status: statusToSet
              })
              .eq("id", currentDisputeId);

            if (updateError) {
              console.error("Error updating dispute status:", updateError);
            }

            // Add AI message explaining the issue
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
                content: "Would you like to select another transaction to dispute or end this chat?",
              });

            // Reset state to allow selecting another transaction
            setSelectedTransaction(null);
            setSelectedReason(null);
            setAiClassification(null);
            setUploadedDocuments([]);
            setArtifacts([]);
            setShowReasonPicker(false);
            setShowDocumentUpload(false);
            setShowTransactions(false);
            setShowContinueOrEndButtons(true);
            
            toast.info(classification.category === "mismatch" 
              ? "The details don't match the selected reason" 
              : "This reason is not eligible for chargeback");
            return;
          }

          // Update dispute with AI-classified reason
          const { error: reasonUpdateError } = await supabase
            .from("disputes")
            .update({
              reason_id: classification.category,
              reason_label: classification.categoryLabel,
              custom_reason: reason.customReason,
              status: "reason_selected"
            })
            .eq("id", currentDisputeId);

          if (reasonUpdateError) throw reasonUpdateError;

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
        
        const { error: updateError } = await supabase
          .from("disputes")
          .update({
            reason_id: reason.id,
            reason_label: reason.label,
            custom_reason: reason.customReason || null,
            status: "reason_selected"
          })
          .eq("id", currentDisputeId);

        if (updateError) {
          console.error("Error updating dispute reason:", updateError);
        }

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
    if (!currentConversationId || !currentDisputeId || !user) return;

    try {
      // Store uploaded documents in session state
      setUploadedDocuments(documents);
      // We are now processing; clear any previous re-upload state
      setNeedsReupload(false);
      
      setShowDocumentUpload(false);
      setShowTransactions(false);
      setShowReasonPicker(false);

      // Upload files to Supabase Storage
      const uploadedArtifacts: ArtifactDoc[] = [];
      for (const doc of documents) {
        const filePath = `${user.id}/${currentDisputeId}/${doc.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('dispute-documents')
          .upload(filePath, doc.file, { upsert: true });
        
        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast.error(`Failed to upload ${doc.file.name}`);
        } else {
          uploadedArtifacts.push({
            requirementName: doc.requirementName,
            name: doc.file.name,
            size: doc.file.size,
            type: doc.file.type,
            path: filePath
          });
        }
      }

      setArtifacts(uploadedArtifacts);

      // Update dispute with documents metadata and artifact paths
      const documentsData = uploadedArtifacts.map(a => ({
        name: a.name,
        size: a.size,
        type: a.type,
        requirementName: a.requirementName,
        path: a.path
      }));

      await supabase
        .from("disputes")
        .update({
          documents: documentsData,
          status: "documents_uploaded"
        })
        .eq("id", currentDisputeId);

      // Add user message about documents uploaded with document attachments
      const userMessage = `Uploaded ${documents.length} document${documents.length > 1 ? 's' : ''}`;

      // Add message with documents attached for inline display
      const messageWithDocs: Message = {
        id: `upload-${Date.now()}`,
        role: "user",
        content: userMessage,
        created_at: new Date().toISOString(),
        documents: documents
      };
      setMessages(prev => [...prev, messageWithDocs]);

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
            content: "Thank you for uploading the required documents. Pace is verifying them. Please wait...",
          });

        toast.success("Documents submitted successfully");

        // Verify documents using AI
        try {
          // Prepare FormData with documents and requirements
          const formData = new FormData();
          
          // Get the requirements that were used
          const requirements = aiClassification?.documents?.map(doc => ({
            name: doc.name,
            uploadType: doc.uploadTypes.split(',').map((t: string) => t.trim().toLowerCase())
          })) || selectedReason?.id && DOCUMENT_REQUIREMENTS[selectedReason.id] || DOCUMENT_REQUIREMENTS.other;

          // Add dispute context to help AI understand what the issue is
          const disputeContext = {
            reasonLabel: selectedReason?.label || 'Other',
            customReason: selectedReason?.customReason || '',
            aiExplanation: aiClassification?.explanation || ''
          };

          formData.append('requirements', JSON.stringify(requirements));
          formData.append('disputeContext', JSON.stringify(disputeContext));
          formData.append('disputeId', currentDisputeId!);
          formData.append('transactionId', selectedTransaction.id);
          
          // Add each document file
          documents.forEach(doc => {
            formData.append(doc.requirementName, doc.file);
          });

          // Use direct fetch with full function URL for FormData payloads
          const { data: { session: fnSession } } = await supabase.auth.getSession();
          if (!fnSession?.access_token) {
            toast.error('Session expired. Please sign in again.');
            navigate('/login');
            return;
          }

          const verificationResp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-documents`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${fnSession.access_token}`,
              },
              body: formData,
            }
          );

          if (!verificationResp.ok) {
            const errText = await verificationResp.text();
            throw new Error(errText || 'Failed to verify documents');
          }

          const verificationData = await verificationResp.json();

          setIsCheckingDocuments(false);


          console.log('Verification result:', verificationData);

          if (verificationData.success) {
            // All documents are valid - use decision engine for all transactions
            if (currentDisputeId && selectedTransaction) {
              // Map requirement names to keys expected by evaluate-decision
              const requirementToKeyMap: Record<string, string> = {
                // Fraud/Unauthorized
                'Police report or fraud claim': 'police_report',
                'Bank statement showing unauthorized charge(s)': 'bank_statement',
                'Transaction receipt or email confirmation': 'transaction_receipt',
                
                // Not Received
                'Order confirmation or invoice': 'invoice',
                'Shipping tracking number or delivery receipt': 'tracking_proof',
                'Delivery receipt': 'tracking_proof',
                'Tracking number': 'tracking_proof',
                'Proof of shipment or delivery': 'tracking_proof',
                'Correspondence (e.g., emails) showing failure to deliver': 'communication',
                
                // Duplicate
                'Bank statement showing duplicate charges': 'bank_statement',
                'Transaction receipt or invoice': 'invoice',
                'Merchant correspondence proving duplicate charges': 'communication',
                
                // Incorrect Amount
                'Transaction receipt showing agreed price': 'invoice',
                'Bank statement showing incorrect charge': 'bank_statement',
                'Email correspondence with merchant regarding pricing discrepancy': 'communication',
                
                // Cancelled/Refund
                'Cancellation confirmation or proof': 'cancellation_proof',
                'Email or message showing refund request': 'communication',
                
                // Product quality issues
                'Photos of damaged or defective product': 'product_photo',
                'Original invoice or order confirmation': 'invoice',
                'Communication with merchant about the issue': 'communication'
              };
              
              // Prepare docCheck from verification results
              const docCheck = verificationData.results.map((r: any) => {
                const mappedKey = requirementToKeyMap[r.requirementName] || r.requirementName.toLowerCase().replace(/\s+/g, '_');
                return {
                  key: mappedKey,
                  isValid: r.isValid,
                  reason: r.reason
                };
              });

              // Get session for auth
              const { data: { session } } = await supabase.auth.getSession();
              if (!session?.access_token) {
                toast.error('Session expired. Please sign in again.');
                navigate('/login');
                return;
              }

              // Call decision engine for ALL transactions (secured and unsecured)
              console.log('Calling evaluate-decision function...');
              const decisionResponse = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evaluate-decision`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({
                    disputeId: currentDisputeId,
                    transactionId: selectedTransaction.id,
                    docCheck
                  })
                }
              );

              if (!decisionResponse.ok) {
                const errorData = await decisionResponse.json();
                throw new Error(errorData.error || 'Failed to evaluate decision');
              }

              const decisionData = await decisionResponse.json();
              console.log('Decision result:', decisionData);

              if (decisionData.success && decisionData.decision) {
                const decision = decisionData.decision;
                
                let statusMessage = '';
                let finalStatus = 'approved';
                
                // If a chargeback should be filed (but NOT for write-offs), trigger backend action first
                let cardNetwork = '';
                if (['FILE_CHARGEBACK', 'FILE_CHARGEBACK_WITH_TEMP_CREDIT'].includes(decision.decision)) {
                  try {
                    console.log('Invoking process-chargeback-action...');
                    const { data: cbData, error: cbError } = await supabase.functions.invoke('process-chargeback-action', {
                      body: {
                        disputeId: currentDisputeId,
                        transactionId: selectedTransaction.id,
                      }
                    });
                    if (cbError) {
                      console.error('process-chargeback-action error:', cbError);
                    } else {
                      console.log('process-chargeback-action result:', cbData);
                      cardNetwork = cbData?.cardNetwork || 'the card network';
                    }
                  } catch (err) {
                    console.error('Failed to invoke process-chargeback-action:', err);
                  }
                }
                
                // Get currency symbol
                const getCurrencySymbol = (currency: string) => {
                  const symbols: { [key: string]: string } = {
                    'INR': '₹',
                    'USD': '$',
                    'EUR': '€',
                    'GBP': '£',
                  };
                  return symbols[currency] || currency + ' ';
                };
                
                const currencySymbol = getCurrencySymbol(selectedTransaction.transaction_currency);
                const amount = selectedTransaction.transaction_amount.toFixed(2);
                
                // Map decision to user-friendly message
                switch (decision.decision) {
                  case 'APPROVE_WRITEOFF':
                    statusMessage = `✅ Great news! We have verified your purchase and hence you are eligible for a refund of ${currencySymbol}${amount} which will be reflected in your bank account in 4-7 days.`;
                    finalStatus = 'write_off_approved';
                    break;
                  case 'FILE_CHARGEBACK':
                  case 'FILE_CHARGEBACK_WITH_TEMP_CREDIT':
                    const tempCreditNote = decision.decision === 'FILE_CHARGEBACK_WITH_TEMP_CREDIT' 
                      ? `\n\n💳 We've also issued a temporary credit of ${currencySymbol}${amount} to your account while we resolve this.` 
                      : '';
                    statusMessage = `✅ We've reviewed your documents and everything is in order.\n\nWe've now filed your chargeback for ${currencySymbol}${amount} with ${cardNetwork} and notified the merchant.${tempCreditNote}\n\nWe know disputed charges can be stressful, Pace is on it, and we'll keep you updated at every step.`;
                    finalStatus = 'approved';
                    break;
                  case 'WAIT_FOR_SETTLEMENT':
                    statusMessage = `⏳ Your dispute is being processed. ${decision.reason_summary} We'll update you within 24 hours.`;
                    finalStatus = 'pending';
                    break;
                  case 'REQUEST_REFUND_FROM_MERCHANT':
                    statusMessage = `🔄 We're requesting a refund directly from the merchant. ${decision.reason_summary} You should receive an update within 5-7 business days.`;
                    finalStatus = 'pending';
                    break;
                  case 'DECLINE_NOT_ELIGIBLE':
                    statusMessage = `❌ Unfortunately, your dispute is not eligible for a chargeback. ${decision.reason_summary}`;
                    finalStatus = 'denied';
                    break;
                  case 'MANUAL_REVIEW':
                    statusMessage = `🔍 Your case requires additional review by our team. ${decision.reason_summary} We'll get back to you within 2-3 business days.`;
                    finalStatus = 'pending';
                    break;
                  default:
                    statusMessage = '✅ Your dispute has been submitted and is approved.';
                }

                // Update dispute status
                await supabase
                  .from("disputes")
                  .update({ status: finalStatus })
                  .eq("id", currentDisputeId);

                // Insert final message
                await supabase
                  .from("messages")
                  .insert({
                    conversation_id: currentConversationId,
                    role: "assistant",
                    content: statusMessage,
                  });

                // Reset state but load artifacts from database
                const { data: storedDocuments } = await supabase
                  .from('dispute_documents')
                  .select('*')
                  .eq('dispute_id', currentDisputeId)
                  .order('created_at', { ascending: true });

                if (storedDocuments && storedDocuments.length > 0) {
                  const artifactDocs: ArtifactDoc[] = storedDocuments.map(doc => ({
                    requirementName: doc.requirement_name,
                    name: doc.file_name,
                    size: doc.file_size,
                    type: doc.file_type,
                    path: doc.storage_path
                  }));
                  setArtifacts(artifactDocs);
                }

                setSelectedTransaction(null);
                setSelectedReason(null);
                setAiClassification(null);
                setUploadedDocuments([]);
                setShowReasonPicker(false);
                setShowDocumentUpload(false);
                setShowTransactions(false);
                setShowContinueOrEndButtons(false);
              } else {
                throw new Error('Decision evaluation failed');
              }
            }
          } else {
            // Some documents failed verification
            const invalidDocs = verificationData.invalidDocs;
            const errorMessage = `❌ Document verification failed. The following documents need to be corrected:\n\n${invalidDocs.map((doc: any) => 
              `• ${doc.requirement}\n  File: ${doc.fileName}\n  Issue: ${doc.reason}`
            ).join('\n\n')}\n\nPlease re-upload the correct documents.`;

            await supabase
              .from("messages")
              .insert({
                conversation_id: currentConversationId,
                role: "assistant",
                content: errorMessage,
              });

            // Keep the document upload UI open for re-upload and hide other options until user responds
            setNeedsReupload(true);
            setShowContinueOrEndButtons(false);
            setShowTransactions(false);
            setShowDocumentUpload(true);
            toast.error("Some documents failed verification");
          }
        } catch (error: any) {
          console.error('Document verification error:', error);
          setIsCheckingDocuments(false);
          
          await supabase
            .from("messages")
            .insert({
              conversation_id: currentConversationId,
              role: "assistant",
              content: "⚠️ We encountered an error while verifying your documents. Your dispute has been submitted for manual review. We'll get back to you soon.",
            });

          // Fallback: proceed without verification
          if (currentDisputeId) {
            await supabase
              .from("disputes")
              .update({ status: "approved" })
              .eq("id", currentDisputeId);

            setSelectedTransaction(null);
            setSelectedReason(null);
            setAiClassification(null);
            setUploadedDocuments([]);
            setShowReasonPicker(false);
            setShowDocumentUpload(false);
            setShowTransactions(false);
            setShowContinueOrEndButtons(true);
          }
          
          toast.error("Document verification failed, proceeding with manual review");
        }
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
    setNeedsReupload(false);
    setSelectedReason(null);
    setUploadedDocuments([]);
    setArtifacts([]);
    setOrderDetails("");
    setShowOrderDetailsInput(false);
  };

  const handleHelpRequest = () => {
    setIsHelpWidgetOpen(true);
  };

  const handleResumeQuestion = async () => {
    // Only resume if we actually have a pending question step
    const hasPendingQuestion = questionStep !== null && currentQuestion.trim().length > 0;

    if (hasPendingQuestion) {
      // Avoid duplicating if it's already the last assistant message
      const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
      if (!lastAssistant || lastAssistant.content !== currentQuestion) {
        const questionMessage: Message = {
          id: `question-resume-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role: "assistant",
          content: currentQuestion,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, questionMessage]);
      }
      setTimeout(() => {
        setShowOrderDetailsInput(true);
      }, 300);
      return;
    }

    // Otherwise, restore the appropriate UI step
    if (showReasonPicker) {
      setShowReasonPicker(true);
      return;
    }

    if (!currentDisputeId) return;

    try {
      const { data: dispute } = await supabase
        .from('disputes')
        .select('status')
        .eq('id', currentDisputeId)
        .maybeSingle();

      if (!dispute) return;

      setTimeout(() => {
        if (dispute.status === "precheck_passed") {
          setShowReasonPicker(true);
        }
      }, 300);
    } catch (error) {
      console.error('Failed to fetch dispute status:', error);
    }
  };

  // Show nothing while checking role to prevent flash
  if (isCheckingRole) {
    return null;
  }

  return (
    <div className="min-h-screen h-screen flex w-full overflow-hidden bg-background">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        {/* Sidebar */}
        <ResizablePanel
          defaultSize={20}
          minSize={15}
          maxSize={35}
          className={`
            ${isChatExpanded 
              ? 'hidden' 
              : 'hidden lg:block'
            }
          `}
        >
          <div className="h-full border-r border-border bg-card">
            <ChatHistory
              currentConversationId={currentConversationId || undefined}
              onConversationSelect={handleConversationSelect}
              onNewChat={handleNewChat}
            />
          </div>
        </ResizablePanel>
        
        {/* Resize Handle */}
        <ResizableHandle 
          className={`
            ${isChatExpanded ? 'hidden' : 'hidden lg:flex'}
          `}
        />
        
        {/* Chat Panel */}
        <ResizablePanel
          defaultSize={80}
          minSize={65}
          className="flex flex-col h-full"
        >
          <div className="flex-1 flex flex-col h-full bg-background">
              <>
                {/* Header */}
                <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsChatExpanded(!isChatExpanded)}
                        className="h-8 w-8"
                        aria-label={isChatExpanded ? "Exit full screen" : "Expand chat"}
                      >
                        {isChatExpanded ? (
                          <X className="h-4 w-4" />
                        ) : (
                          <Menu className="h-4 w-4" />
                        )}
                      </Button>
                      <div>
                        <h1 className="text-xl font-semibold">Chargeback Assistant</h1>
                        <p className="text-sm text-muted-foreground">Powered by Pace</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
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
              {isSwitchingConversation ? (
                <div className="flex items-center justify-center py-20">
                  <Card className="p-6 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Loading conversation...</span>
                  </Card>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      role={message.role as "user" | "assistant"}
                      content={message.content}
                      timestamp={new Date(message.created_at)}
                      documents={message.documents}
                    />
                  ))}

                  {/* Help messages inline with conversation */}
                  {helpWidgetMessages.length > 1 && helpWidgetMessages.map((msg, idx) => (
                    <ChatMessage
                      key={`help-${idx}`}
                      role={msg.role}
                      content={msg.content}
                      timestamp={msg.timestamp}
                    />
                  ))}

                  {isCheckingEligibility && (
                <div className="mt-6 flex items-center justify-center">
                  <Card className="p-6 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <LoadingText />
                  </Card>
                </div>
              )}
              {isCheckingDocuments && (
                <div className="mt-6 flex items-center justify-center">
                  <Card className="p-6 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <LoadingText />
                  </Card>
                </div>
              )}
              {awaitingEvidenceTransaction ? (
                <div key={`evidence-upload-${currentConversationId}`} className="mt-6">
                  <CustomerEvidenceUpload
                    transactionId={awaitingEvidenceTransaction.id}
                    onComplete={() => {
                      setAwaitingEvidenceTransaction(null);
                      loadMessages(currentConversationId!);
                    }}
                  />
                </div>
              ) : showTransactions ? (
                <div key={`txn-list-${currentConversationId}`} className="mt-6">
                  <TransactionList transactions={transactions} onSelect={handleTransactionSelect} />
                </div>
              ) : null}
              {showContinueOrEndButtons && !needsReupload && (
                <div key={`continue-buttons-${currentConversationId}`} className="mt-6 flex gap-3 justify-center">
                  <Button 
                    onClick={() => {
                      setShowContinueOrEndButtons(false);
                      setShowTransactions(true);
                    }} 
                    variant="default"
                    size="lg"
                  >
                    Transaction List
                  </Button>
                  <Button 
                    onClick={handleEndSession} 
                    variant="outline"
                    size="lg"
                  >
                    End Session
                  </Button>
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
              {showOrderDetailsInput && (
                <div key={`order-details-${currentConversationId}`} className="mt-6">
                  <Card className="p-6 space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {questionStep 
                          ? "Your answer" 
                          : "Please describe more about your transaction"}
                      </label>
                      {!questionStep && (
                        <p className="text-sm text-muted-foreground">
                          For example, you can share:
                          • What was your transaction about
                          • The issue you are facing (e.g., incorrect product, damaged goods, unauthorized charge)
                          • Any additional information that will help us understand the situation better
                        </p>
                      )}
                      <Textarea
                        placeholder={questionStep ? "Type your answer here..." : "Describe your transaction and the issue..."}
                        value={orderDetails}
                        onChange={(e) => {
                          setOrderDetails(e.target.value);
                          // Debounce save to sessionStorage
                          if (inputDraftTimer.current) {
                            clearTimeout(inputDraftTimer.current);
                          }
                          inputDraftTimer.current = setTimeout(() => {
                            if (currentConversationId) {
                              saveUIState(currentConversationId);
                            }
                          }, 400);
                        }}
                        rows={4}
                        className="resize-none"
                        disabled={isGeneratingQuestion}
                      />
                    </div>
                    <Button 
                      onClick={handleOrderDetailsSubmit}
                      disabled={!orderDetails.trim() || isGeneratingQuestion}
                      className="w-full"
                    >
                      {isGeneratingQuestion ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        questionStep === 3 ? "Submit Final Answer" : "Continue"
                      )}
                    </Button>
                  </Card>
                </div>
              )}
              {isGeneratingQuestion && (
                <div key={`generating-question-${currentConversationId}`} className="mt-6">
                  <Card className="p-6">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <p className="text-sm">Analyzing your response...</p>
                    </div>
                  </Card>
                </div>
              )}
              {showReasonPicker && (
                <div key={`reason-picker-${currentConversationId}`} className="mt-6">
                  <ReasonPicker onSelect={handleReasonSelect} />
                </div>
              )}
              {isAnalyzingReason && (
                <div key={`analyzing-${currentConversationId}`} className="mt-6">
                  <Card className="p-6">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <p className="text-sm"><LoadingText /></p>
                    </div>
                  </Card>
                </div>
              )}
              {showDocumentUpload && selectedReason && (
                <div key={`doc-upload-${currentConversationId}`} className="mt-6">
                  <DocumentUpload
                    reasonId={selectedReason.id}
                    reasonLabel={selectedReason.label}
                    customReason={selectedReason.customReason}
                    aiClassification={aiClassification}
                    onComplete={handleDocumentsComplete}
                  />
                </div>
              )}
                 </>
               )}


                  {/* Help Widget inline - only show input area when open */}
                  {isHelpWidgetOpen && (
                    <HelpWidget 
                      onClose={() => {
                        setIsHelpWidgetOpen(false);
                        // Resume only if there's a pending step
                        if (questionStep !== null || showReasonPicker) {
                          handleResumeQuestion();
                        }
                      }}
                      messages={helpWidgetMessages}
                      setMessages={setHelpWidgetMessages}
                      onResumeQuestion={handleResumeQuestion}
                    />
                  )}
              </div>
            </div>
          </ScrollArea>

          {/* Help button at bottom */}
          {!isReadOnly && !isHelpWidgetOpen && (
            <div 
              onClick={handleHelpRequest}
              className="w-full bg-card border-t border-border px-6 py-3 cursor-pointer hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
            >
              <MessageCircleQuestion className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold">Have a question? Ask Pace for help</span>
            </div>
          )}
              </>
            </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      
      {/* Preview Pane */}
      <PreviewPane 
        isOpen={previewPaneOpen}
        onClose={() => setPreviewPaneOpen(false)}
        type="document"
        documentUrl={previewContent?.url}
        extractedFields={previewContent?.extractedFields}
        title="Document Preview"
      />
    </div>
  );
};

export default Portal;
