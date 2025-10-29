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
            text: `You are a context-aware image/document verifier for chargeback disputes.

DISPUTE CONTEXT MAPPING - What evidence fits each dispute type:

| Dispute Type | What Evidence Should Generally Show |
|--------------|-------------------------------------|
| Unauthorized Transaction | Account statement, fraud claim, or any document confirming customer reported unauthorized use |
| Item Not Received | Proof of order, communication with merchant, or delivery tracking showing non-receipt |
| Received Wrong Item | Order confirmation or correspondence showing mismatch between ordered and received item |
| Damaged/Defective Item | Invoice, warranty, or correspondence showing item issues or complaint |
| Refund Not Received | Refund promise or confirmation that credit has not been processed |
| Service Not Rendered | Invoice or order showing service paid for but not delivered |
| Other (custom reason) | Any document that reasonably supports the described situation |

${disputeInfo}

REQUIREMENT: "${requirement.name}"
Expected types: ${requirement.uploadType.join(', ')}

${getDocumentTypeRequirements(requirement.name)}

VERIFICATION FOCUS - Apply common-sense validation:
✅ The image should be the correct type for the requirement
✅ The content should be readable and clearly relate to the customer's explanation
✅ The image should look real, not a template, screenshot, or random unrelated file
✅ The image should not contradict the dispute reason

SOFTER REJECTION CRITERIA - Mark as INVALID only if ANY of these apply:
❌ The image is blank, completely unreadable, or corrupted
❌ The content is completely unrelated to the dispute (e.g., random photo instead of product)
❌ The image appears fake, templated, or non-genuine
❌ The type clearly doesn't match what's required (e.g., website screenshot for "actual product photo")
❌ The image is just a cropped fragment with no meaningful content

SIMPLIFIED CHECKLIST:
1. ✓ Does the image look like the expected type?
2. ✓ Is it readable and complete (not blank, partial, or corrupted)?
3. ✓ Is the content relevant to the dispute reason and customer's explanation?
4. ✓ Does it seem authentic and not clearly fabricated?
5. ✓ Does it support the customer's claim in a reasonable way?

DECISION GUIDELINES:
- If the image matches the expected type and context, even if quality isn't perfect → ✅ Valid
- If the image is plausible but not ideal quality, e.g., phone photo in normal lighting → ✅ Valid
- If the image is clearly unrelated, fake, or blank → ❌ Invalid

Be reasonable, not robotic. Accept documents that are contextually relevant and authentic, even if not perfect.

Respond with JSON only:
{
  "isValid": true/false,
  "reason": "Brief explanation of why this image is valid or invalid based on relevance and authenticity"
}`
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
        content = `You are a context-aware PDF document verifier for chargeback disputes.

DISPUTE CONTEXT MAPPING - What evidence fits each dispute type:

| Dispute Type | What Evidence Should Generally Show |
|--------------|-------------------------------------|
| Unauthorized Transaction | Account statement, fraud claim, or any document confirming customer reported unauthorized use |
| Item Not Received | Proof of order, communication with merchant, or delivery tracking showing non-receipt |
| Received Wrong Item | Order confirmation or correspondence showing mismatch between ordered and received item |
| Damaged/Defective Item | Invoice, warranty, or correspondence showing item issues or complaint |
| Refund Not Received | Refund promise or confirmation that credit has not been processed |
| Service Not Rendered | Invoice or order showing service paid for but not delivered |
| Other (custom reason) | Any document that reasonably supports the described situation |

${disputeInfo}

REQUIREMENT: "${requirement.name}"
Expected types: ${requirement.uploadType.join(', ')}

${getDocumentTypeRequirements(requirement.name)}

VERIFICATION FOCUS - Apply common-sense validation:
✅ The document should be the correct type (e.g., "invoice" if asked for invoice)
✅ The content should be readable and clearly relate to the customer's explanation
✅ The PDF should look real, not a template, screenshot, or random unrelated file
✅ The PDF should not contradict the reason (e.g., refund receipt when claim says "not received")

SOFTER REJECTION CRITERIA - Mark as INVALID only if ANY of these apply:
❌ The file is blank, unreadable, or corrupted
❌ The content is completely unrelated to the dispute (e.g., a project report instead of an invoice)
❌ The document appears fake, templated, or non-genuine
❌ The type of document clearly doesn't match what's required (e.g., an email uploaded as a "Proof of Purchase")
❌ The file is just a screenshot or cropped fragment with no meaningful content

SIMPLIFIED CHECKLIST:
1. ✓ Does the document look like the expected type (invoice, receipt, communication, etc.)?
2. ✓ Is it readable and complete (not blank, partial, or corrupted)?
3. ✓ Is the content relevant to the dispute reason and the customer's explanation?
4. ✓ Does it seem authentic and not clearly fabricated?
5. ✓ Does it support the customer's claim in a reasonable way?

DECISION GUIDELINES:
- If the document matches the expected type and context, even if missing details like invoice number or amount → ✅ Valid
- If the document is plausible but partially incomplete, e.g., missing totals or logo → ✅ Valid (explanation: limited but relevant evidence)
- If the document is clearly unrelated, fake, or blank → ❌ Invalid

Be reasonable, not robotic. Don't reject for minor formatting or missing invoice numbers. Do reject unreadable, irrelevant, or clearly fake documents.

PDF Document (base64-encoded):
${base64}

Respond with JSON only:
{
  "isValid": true/false,
  "reason": "Brief explanation of why this document is valid or invalid based on relevance and authenticity"
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
