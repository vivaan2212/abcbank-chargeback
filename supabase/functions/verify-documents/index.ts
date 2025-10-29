import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to get lenient document-type-specific guidance
function getDocumentTypeRequirements(requirementName: string): string {
  const nameLower = requirementName.toLowerCase();
  
  if (nameLower.includes('invoice') || nameLower.includes('receipt') || nameLower.includes('order confirmation')) {
    return `GENERAL GUIDANCE FOR INVOICES/RECEIPTS/ORDER CONFIRMATIONS:
This document should typically show:
- Merchant or business name
- Transaction details and items purchased
- Some indication of amount or payment
- Date information

✅ ACCEPT even if missing: invoice numbers, perfect totals, logos, or formatted headers
✅ ACCEPT if: Document is clearly an invoice/receipt and relates to the dispute context
❌ ONLY REJECT if: Document is clearly NOT an invoice/receipt, is completely unreadable, or is totally unrelated`;
  }
  
  if (nameLower.includes('proof of purchase')) {
    return `GENERAL GUIDANCE FOR PROOF OF PURCHASE:
This document should typically show:
- Evidence that a transaction occurred
- Merchant or seller information
- Some payment confirmation or transaction details
- Reference to the items/services purchased

✅ ACCEPT even if missing: specific order numbers, perfect formatting, or exact amounts
✅ ACCEPT if: Document demonstrates payment occurred and relates to the dispute
❌ ONLY REJECT if: Document doesn't show any transaction evidence, is unreadable, or completely unrelated`;
  }
  
  if (nameLower.includes('communication') || nameLower.includes('email') || nameLower.includes('chat') || nameLower.includes('support') || nameLower.includes('correspondence')) {
    return `GENERAL GUIDANCE FOR COMMUNICATION/CORRESPONDENCE:
This document should typically show:
- Sender and receiver information (names, emails, or usernames)
- Message content related to the dispute
- Some indication of when the communication occurred
- Discussion about the transaction or issue

✅ ACCEPT even if missing: perfect email formatting, specific subject lines, or complete headers
✅ ACCEPT if: Communication discusses the dispute issue and appears authentic
❌ ONLY REJECT if: No identifiable parties, no message content, completely unrelated topic, or blank template`;
  }
  
  if (nameLower.includes('shipping') || nameLower.includes('tracking') || nameLower.includes('delivery')) {
    return `GENERAL GUIDANCE FOR SHIPPING/TRACKING DOCUMENTS:
This document should typically show:
- Delivery or shipping information
- Carrier or provider name
- Some tracking or reference details
- Shipping status or delivery information

✅ ACCEPT even if missing: perfectly formatted tracking numbers, complete addresses, or exact dates
✅ ACCEPT if: Document shows shipping/delivery information relevant to the dispute
❌ ONLY REJECT if: No delivery information at all, completely unreadable, or unrelated document`;
  }
  
  if (nameLower.includes('photo') || nameLower.includes('picture') || nameLower.includes('image') || nameLower.includes('product')) {
    return `GENERAL GUIDANCE FOR PRODUCT PHOTOS:
This photo should typically show:
- The actual physical product or item
- Relevant details that support the claim
- Clear enough to understand what's being shown
- For damage claims: visible issue or defect
- For wrong item claims: what was actually received

✅ ACCEPT even if: Lighting isn't perfect, minor blur, or taken with phone camera
✅ ACCEPT if: Shows the actual product and supports the dispute claim
❌ ONLY REJECT if: Too blurry to see anything, screenshot of website, stock photo, or shows completely unrelated item`;
  }
  
  // Default lenient guidance for any other document type
  return `GENERAL GUIDANCE:
This document should:
- Relate to the requirement: "${requirementName}"
- Be readable and appear authentic
- Support the customer's dispute in some way
- Contain relevant information about the transaction or issue

✅ ACCEPT if: Document is relevant, readable, and appears genuine
❌ ONLY REJECT if: Completely unreadable, totally unrelated, clearly fake, or blank/corrupted`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const requirementsJson = formData.get('requirements') as string;
    const requirements = JSON.parse(requirementsJson);
    const disputeContextJson = formData.get('disputeContext') as string;
    const disputeContext = disputeContextJson ? JSON.parse(disputeContextJson) : null;

    console.log('Verifying documents:', { requirements, disputeContext });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const verificationResults: Array<{
      requirementName: string;
      fileName: string;
      isValid: boolean;
      reason: string;
    }> = [];

    // Process each document
    for (const requirement of requirements) {
      const file = formData.get(requirement.name) as File;
      if (!file) {
        verificationResults.push({
          requirementName: requirement.name,
          fileName: 'Not uploaded',
          isValid: false,
          reason: 'Document was not uploaded'
        });
        continue;
      }

      console.log(`Verifying document: ${file.name} for requirement: ${requirement.name}`);

      // Convert file to base64 (chunked to avoid stack overflow)
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64 = btoa(binary);
      const mimeType = file.type || 'application/octet-stream';

      // Determine file type
      const isImage = mimeType.startsWith('image/');
      const isPDF = mimeType === 'application/pdf';

      let content;
      
      if (isImage) {
        // For images, use vision capabilities
        const disputeInfo = disputeContext 
          ? `\nDISPUTE CONTEXT:
- Reason: ${disputeContext.reasonLabel}
- Customer's explanation: ${disputeContext.customReason || disputeContext.aiExplanation || 'Not provided'}

IMPORTANT: Understand the dispute context. For example:
- If the issue is "received wrong/different item", then a photo of the received item IS valid evidence
- If the issue is "damaged/defective", look for visible damage or defects
- If the issue is "not as described", the photo should show how it differs from description
`
          : '';

        content = [
          {
            type: "text",
            text: `You are an image verifier for chargeback evidence. You will be given two inputs:

Requested document type — what the system expects (e.g., "Invoice", "Proof of purchase", "Cancellation confirmation", "Delivery tracking", "Refund confirmation", "Bank statement", "Communication / support ticket").

Uploaded image — the file the customer submitted.

Goal:
Decide whether the uploaded image is the correct document type and reasonably supports the customer's dispute. If it is, approve it. If it is not, reject and give a precise, actionable resubmit instruction that tells the customer what to upload instead.

General rules (use common sense, be context-aware):

Focus on document type, readability, and relevance — not perfection.

Do NOT reject a document only because it lacks invoice numbers, order IDs, or exact totals. Accept plausible, readable images that match the requested type.

Reject if the image is unreadable (blank/corrupted), obviously unrelated (project plan when invoice expected), or clearly fake/manipulated.

If the image could be the correct type but is ambiguous (e.g., cropped, only partial), ask for resubmission with a specific instruction (what to include / better photo / upload original document).

How to evaluate:

Identify the document type from the image (header words like INVOICE, RECEIPT, STATEMENT, EMAIL, CANCELLATION, CONFIRMATION; or layout that matches such documents).

Confirm the image is readable (text not blurred; content visible).

Confirm relevance to the requested type and to the customer's explanation (e.g., if reason is "received wrong item", the image should show order info or merchant communication relevant to that order).

If valid, produce isValid: true and a short reason explaining what made it valid (e.g., "Image clearly labeled 'INVOICE' and contains merchant name and order details matching the claim.").

If invalid or ambiguous, produce isValid: false and a clear resubmit instruction telling the user exactly what to upload instead (e.g., "Please re-upload the order confirmation or invoice — we need an image showing the merchant name and order date; if you have a PDF, please upload the original document instead of a screenshot").

Acceptance heuristics (be permissive):

Invoice / Receipt: accept if the image looks like an invoice/receipt (has merchant name, line items or payment summary, and a date) even if invoice number is missing.

Bank Statement: accept if image contains transaction list and account heading even if account number is partially masked.

Cancellation Confirmation / Refund Confirmation: accept if image contains a clear message or header from merchant stating cancellation or refund (email screenshot or document photo OK).

Communication / Support Ticket: accept if image contains sender/recipient and message text showing the request or merchant response.

Product Photo: accept if image shows the actual physical product relevant to the dispute (e.g., wrong item received, damaged item).

Reject / ask to resubmit when (examples):

Image is blank, corrupted, unreadable → ask to re-upload clear photo or original document.

Image is a screenshot of a website where the user was asked to upload an official document → ask for original document or a proper export.

Image is clearly unrelated (e.g., a project plan) → explain mismatch and ask for the required doc type.

Image is partially cropped or missing important details → ask to upload the full document or a better photo.

${disputeInfo}

REQUIREMENT: "${requirement.name}"
Expected types: ${requirement.uploadType.join(', ')}

${getDocumentTypeRequirements(requirement.name)}

Output (JSON only) — always return exactly this structure:

{
  "isValid": true|false,
  "reason": "Short, specific explanation. If false, include a clear resubmit instruction exactly saying what to upload next."
}

Examples of valid responses:

{"isValid": true, "reason":"Valid invoice: Image shows 'INVOICE' header, merchant 'ACME STORE', order date present — supports claim."}

{"isValid": false, "reason":"Unreadable: Image is too blurred. Please re-upload a clear photo of the invoice or order confirmation."}

Extra guidance for resubmit messages (be explicit):

If asking for an invoice: "Please re-upload the invoice or order confirmation showing the merchant name and order date. A screenshot of a product page is not acceptable."

If asking for bank statement proof: "Please upload a bank statement showing the transaction line with merchant name and date. If you only have an app screenshot, upload a full PDF export or a clear photo of the full statement page."

If asking for cancellation confirmation: "Please upload the merchant's cancellation confirmation (showing the cancellation/acknowledgement text). A screenshot of account settings alone is insufficient."

Be concise in the JSON reason — include the key evidence found/missing and explicit next step when asking to resubmit.`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64}`
            }
          }
        ];
      } else if (isPDF) {
        // For PDFs, use full AI content analysis by embedding base64 in prompt
        const disputeInfo = disputeContext 
          ? `

DISPUTE CONTEXT:
- Reason: ${disputeContext.reasonLabel}
- Customer's explanation: ${disputeContext.customReason || disputeContext.aiExplanation || 'Not provided'}

IMPORTANT: Understand the dispute context. For example:
- If the issue is "received wrong/different item", look for order confirmations, shipping details, or product descriptions
- If the issue is "not received", look for tracking information, delivery confirmations, or correspondence
- If the issue is "damaged/defective", look for purchase receipts, warranty information, or quality issues documentation
- If the issue is "unauthorized transaction", look for account statements, fraud reports, or identity verification
`
          : '';

        console.log(`Performing full AI content analysis for PDF: ${file.name}`);

        // Embed the base64 PDF directly in the prompt for Gemini to analyze
        content = `You are a PDF verifier for chargeback evidence. You will be given two inputs:

Requested document type — what the system expects (e.g., "Invoice", "Proof of purchase", "Cancellation confirmation", "Delivery tracking", "Refund confirmation", "Bank statement", "Communication / support ticket").

Uploaded PDF — the file the customer submitted.

Goal:
Decide whether the uploaded PDF is the correct document type and reasonably supports the customer's dispute. If it is, approve it. If it is not, reject and give a precise, actionable resubmit instruction that tells the customer what to upload instead.

General rules (use common sense, be context-aware):

Focus on document type, readability, and relevance — not perfection.

Do NOT reject a document only because it lacks invoice numbers, order IDs, or exact totals. Accept plausible, readable PDFs that match the requested type.

Reject if the PDF is unreadable (blank/corrupted), obviously unrelated (project plan when invoice expected), or clearly fake/manipulated.

If the PDF could be the correct type but is ambiguous (e.g., cropped, only partial), ask for resubmission with a specific instruction (what to include / better photo / upload original PDF).

How to evaluate:

Identify the document type from the PDF (header words like INVOICE, RECEIPT, STATEMENT, EMAIL, CANCELLATION, CONFIRMATION; or page layout that matches such documents).

Confirm the document is readable (text not blurred; pages render).

Confirm relevance to the requested type and to the customer's explanation (e.g., if reason is "received wrong item", the PDF should show order info or merchant communication relevant to that order).

If valid, produce isValid: true and a short reason explaining what made it valid (e.g., "PDF clearly labeled 'INVOICE' and contains merchant name and order details matching the claim.").

If invalid or ambiguous, produce isValid: false and a clear resubmit instruction telling the user exactly what to upload instead (e.g., "Please re-upload the order confirmation or invoice — we need a PDF showing the merchant name and order date; if you only have a screenshot, upload the full email or the original PDF").

Acceptance heuristics (be permissive):

Invoice / Receipt: accept if the PDF looks like an invoice/receipt (has merchant name, line items or payment summary, and a date) even if invoice number is missing.

Bank Statement: accept if PDF contains transaction list and account heading even if account number is partially masked.

Cancellation Confirmation / Refund Confirmation: accept if PDF contains a clear message or header from merchant stating cancellation or refund (email export or PDF print OK).

Communication / Support Ticket: accept if PDF contains sender/recipient and message text showing the request or merchant response.

Reject / ask to resubmit when (examples):

PDF is blank, corrupted, unreadable → ask to re-upload original PDF.

PDF is a screenshot of a website where the user was asked to upload an official document → ask for original PDF or a cropped export of the email containing the confirmation.

PDF is clearly unrelated (e.g., a project plan) → explain mismatch and ask for the required doc type.

PDF is partially cropped or missing important pages → ask to upload the full PDF or the original email/attachment.

${disputeInfo}

REQUIREMENT: "${requirement.name}"
Expected types: ${requirement.uploadType.join(', ')}

${getDocumentTypeRequirements(requirement.name)}

Output (JSON only) — always return exactly this structure:

{
  "isValid": true|false,
  "reason": "Short, specific explanation. If false, include a clear resubmit instruction exactly saying what to upload next."
}

Examples of valid responses:

{"isValid": true, "reason":"Valid invoice: PDF header 'INVOICE', merchant 'ACME STORE', order date present — supports claim."}

{"isValid": false, "reason":"Unreadable: PDF pages are blurred. Please re-upload the original PDF or a clear export of the invoice or order confirmation."}

Extra guidance for resubmit messages (be explicit):

If asking for an invoice: "Please re-upload the invoice or order confirmation PDF showing the merchant name and order date. A screenshot of a product page is not acceptable."

If asking for bank statement proof: "Please upload a bank statement PDF showing the transaction line with merchant name and date. If you only have an app screenshot, upload the full PDF export or a photo of the full statement page."

If asking for cancellation confirmation: "Please upload the merchant's cancellation confirmation email or PDF (showing the cancellation/acknowledgement text). A screenshot of account settings alone is insufficient."

Be concise in the JSON reason — include the key evidence found/missing and explicit next step when asking to resubmit.

PDF Document (base64-encoded):
${base64}

Respond with JSON only:
{
  "isValid": true|false,
  "reason": "Short, specific explanation. If false, include a clear resubmit instruction exactly saying what to upload next."
}`;
      } else {
        // For other document types (Word, text files, etc.), do metadata-only checks
        console.log(`Performing metadata-only verification for file type: ${mimeType}`);
        
        content = `You are verifying a document for a chargeback dispute.

The document should be: "${requirement.name}"
Expected types: ${requirement.uploadType.join(', ')}
File provided: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(2)} KB)

Note: Full content analysis is not available for this file type. Based on the filename and file type, does this seem like a plausible document for the requirement?

Be very lenient in your assessment:
✅ Accept if: Filename suggests it might be relevant, file type is reasonable, file size indicates it's not empty
❌ Only reject if: File is empty (0 KB), filename is completely nonsensical, or file type is clearly wrong

Since you cannot read the actual content, give the benefit of the doubt. Most documents with reasonable filenames and file types should be accepted.

Respond with JSON only:
{
  "isValid": true/false,
  "reason": "Brief explanation based on metadata"
}`;
      }

      // Call Lovable AI to verify the document
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'user',
              content: content
            }
          ],
          response_format: { type: "json_object" }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI verification error:', response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: 'Payment required. Please add credits to continue.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        throw new Error(`AI API error: ${response.status}`);
      }

      const aiResponse = await response.json();
      console.log('AI Response:', JSON.stringify(aiResponse, null, 2));

      const aiContent = aiResponse.choices[0].message.content;
      const verification = JSON.parse(aiContent);

      verificationResults.push({
        requirementName: requirement.name,
        fileName: file.name,
        isValid: verification.isValid,
        reason: verification.reason
      });

      console.log(`Verification result for ${file.name}:`, verification);
    }

    // Determine overall success
    const allValid = verificationResults.every(result => result.isValid);
    const invalidDocs = verificationResults.filter(result => !result.isValid);

    console.log('Overall verification result:', { allValid, verificationResults });

    return new Response(
      JSON.stringify({
        success: allValid,
        results: verificationResults,
        invalidDocs: invalidDocs.map(doc => ({
          requirement: doc.requirementName,
          fileName: doc.fileName,
          reason: doc.reason
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in verify-documents function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
