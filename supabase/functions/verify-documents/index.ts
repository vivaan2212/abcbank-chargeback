import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to get strict document-type-specific requirements
function getDocumentTypeRequirements(requirementName: string): string {
  const nameLower = requirementName.toLowerCase();
  
  if (nameLower.includes('invoice') || nameLower.includes('receipt') || nameLower.includes('order confirmation')) {
    return `REQUIRED IDENTIFIERS FOR INVOICES/RECEIPTS/ORDER CONFIRMATIONS:
- Must have clear document header: "INVOICE", "RECEIPT", "ORDER CONFIRMATION", or similar
- Must contain: Invoice/Receipt/Order number (e.g., "Invoice #12345", "Order #ABC-789")
- Must show: Date of transaction
- Must include: Merchant/Seller name and contact information
- Must list: Item description(s) with prices
- Must display: Total amount/payment details
- Must NOT be: Project plans, internal documents, meeting notes, or unrelated reports

REJECT if:
- No clear invoice/receipt header or title
- Missing invoice/order number
- No merchant information
- No item details or prices
- Document is clearly labeled as something else (e.g., "Project Plan", "Meeting Notes")`;
  }
  
  if (nameLower.includes('proof of purchase')) {
    return `REQUIRED IDENTIFIERS FOR PROOF OF PURCHASE:
- Must show: Transaction details or payment confirmation
- Must contain: Order/Transaction number or reference ID
- Must include: Merchant/Seller name
- Must display: Purchase date and time
- Must list: Item(s) purchased with description
- Should show: Price/amount paid and payment method
- Must NOT be: Generic screenshots, wish lists, or shopping carts

REJECT if:
- No transaction/order reference number
- Missing merchant identification
- No clear purchase date
- Document doesn't prove a transaction occurred (e.g., just a product listing)`;
  }
  
  if (nameLower.includes('communication') || nameLower.includes('email') || nameLower.includes('chat') || nameLower.includes('support') || nameLower.includes('correspondence')) {
    return `REQUIRED IDENTIFIERS FOR COMMUNICATION/CORRESPONDENCE:
- Must be: Actual emails, chat transcripts, support tickets, or formal letters
- Must show: Clear sender and receiver information (names, email addresses, or usernames)
- Must contain: Date/timestamp of communication
- Must include: Subject line or conversation topic related to the dispute issue
- Must display: Actual message content (not just metadata or headers)
- Should reference: The specific order, product, or transaction in dispute
- Must NOT be: Generic contact forms, blank templates, or unrelated conversations

REJECT if:
- No identifiable sender/receiver information
- Missing dates or timestamps
- No actual conversation/message content
- Discussion is about unrelated topics
- Document is a template or blank form`;
  }
  
  if (nameLower.includes('shipping') || nameLower.includes('tracking') || nameLower.includes('delivery')) {
    return `REQUIRED IDENTIFIERS FOR SHIPPING/TRACKING DOCUMENTS:
- Must contain: Tracking number or shipment ID
- Must show: Shipping carrier/provider name (USPS, FedEx, UPS, DHL, etc.)
- Must include: Delivery status information
- Must display: Shipping and delivery addresses
- Must show: Relevant dates (shipped date, delivery date, or expected delivery)
- Should include: Package details or weight
- Must NOT be: Generic shipping labels without tracking info

REJECT if:
- No tracking number present
- Missing carrier/provider identification
- No delivery status information
- Addresses are incomplete or missing`;
  }
  
  if (nameLower.includes('photo') || nameLower.includes('picture') || nameLower.includes('image') || nameLower.includes('product')) {
    return `REQUIRED IDENTIFIERS FOR PRODUCT PHOTOS:
- Must show: The actual physical product/item (not screenshots of websites)
- Must be: Clear, well-lit, and in-focus (not blurry or too dark)
- Should display: Relevant product details or features clearly visible
- For damage/defect claims: Must clearly show the specific issue/damage
- For wrong item claims: Must show the item received (even if it's not damaged)
- Must NOT be: Screenshots from websites, stock photos, or catalog images
- Must NOT be: Photos of unrelated items or random objects

REJECT if:
- Image is too blurry to see details
- Photo is a screenshot of a website or app
- Shows generic stock photo (not actual received product)
- For damage claims: damage/defect is not visible
- Image appears to be copied from online source`;
  }
  
  // Default strict rules for any other document type
  return `GENERAL STRICT REQUIREMENTS:
- Document must clearly relate to the requirement: "${requirementName}"
- Must contain specific identifiers relevant to this document type
- Must be complete and legitimate (not partial, truncated, or obviously fake)
- Must be relevant to the customer's dispute context
- Should contain dates, reference numbers, or other verifiable details

REJECT if:
- Document appears generic or could be anything
- Missing critical identifying information
- Clearly labeled as a different document type
- Incomplete or corrupted content`;
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
            text: `You are a STRICT image/document verifier for chargeback disputes.
${disputeInfo}
REQUIREMENT: "${requirement.name}"
Expected types: ${requirement.uploadType.join(', ')}

${getDocumentTypeRequirements(requirement.name)}

CRITICAL REJECTION CRITERIA (mark as INVALID if ANY apply):
❌ Image is blurry, too dark, or unreadable
❌ Photo is a screenshot of a website/app (not actual product photo)
❌ Image shows generic stock photo or catalog picture
❌ For product photos: Shows wrong/unrelated item
❌ For document photos: Missing critical identifiers listed above
❌ Image appears manipulated or fake
❌ Document type clearly doesn't match requirement (e.g., meeting notes when invoice is needed)

VERIFICATION CHECKLIST:
1. ✓ Does the image clearly show what's required?
2. ✓ Is the image quality sufficient (clear, readable, well-lit)?
3. ✓ For documents: Does it contain SPECIFIC IDENTIFIERS (numbers, headers, merchant names)?
4. ✓ For products: Is this the actual physical item (not a screenshot or stock photo)?
5. ✓ Is the content directly relevant to the customer's dispute?

Be STRICT. When quality is poor or identifiers are missing, mark as invalid with specific explanation.

Context Note: If customer claims "wrong item received", a clear photo of what they actually received IS valid - even if undamaged.

Respond with JSON only:
{
  "isValid": true/false,
  "reason": "Specific explanation citing which identifiers were found/missing or quality issues"
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
        content = `You are a STRICT PDF document verifier for chargeback disputes.
${disputeInfo}
REQUIREMENT: "${requirement.name}"
Expected types: ${requirement.uploadType.join(', ')}

${getDocumentTypeRequirements(requirement.name)}

CRITICAL REJECTION CRITERIA (mark as INVALID if ANY apply):
❌ Document title/header indicates it's a DIFFERENT type (e.g., "Project Plan" when invoice is needed)
❌ Missing CRITICAL IDENTIFIERS listed above (e.g., no invoice number, no tracking ID, no order reference)
❌ Document is incomplete, truncated, or corrupted (unreadable sections)
❌ Content is generic/ambiguous - could be anything
❌ Not relevant to the specific dispute context
❌ Appears to be fake, manipulated, or template without real data
❌ Key required fields are blank or missing (e.g., invoice with no items, receipt with no amounts)

STRICT VERIFICATION CHECKLIST:
1. ✓ Does the document HEADER/TITLE match the requirement type?
   Example: If requirement is "invoice", PDF must have "INVOICE" or "RECEIPT" header
2. ✓ Does it contain SPECIFIC IDENTIFIERS (invoice #, order #, tracking #, reference codes)?
   Example: "Invoice #12345", "Order #ABC-789", "Tracking: 1Z999AA10123456784"
3. ✓ Are all REQUIRED FIELDS present for this document type?
   Example: Invoice must have: merchant name, date, items, prices, total
4. ✓ Is the document COMPLETE and LEGITIMATE (not partial/template)?
5. ✓ Does it directly SUPPORT the customer's specific dispute claim?

BE EXTREMELY STRICT:
- If the PDF title says "Project Plan" but user claims it's an "Invoice" → REJECT
- If invoice is missing invoice number → REJECT
- If document has no specific identifiers → REJECT
- If key sections are blank or generic → REJECT
- When in doubt about legitimacy → REJECT with clear explanation

Read the PDF carefully. Cite specific page numbers, headers, or identifiers you found (or didn't find).

PDF Document (base64-encoded):
${base64}

Respond with JSON only:
{
  "isValid": true/false,
  "reason": "Detailed explanation citing specific identifiers found/missing, page numbers if relevant, and why document passes/fails strict requirements"
}`;
      } else {
        // For other document types (Word, text files, etc.), do metadata-only checks
        console.log(`Performing metadata-only verification for file type: ${mimeType}`);
        
        content = `You are verifying a document for a chargeback dispute.

The document should be: "${requirement.name}"
Expected types: ${requirement.uploadType.join(', ')}
File provided: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(2)} KB)

Note: Full content analysis is not available for this file type. Based on the filename and file type, does this seem like an appropriate document for the requirement?
Consider:
- Does the filename suggest it's the right type of document?
- Is the file type appropriate?
- Is the file size reasonable (not empty, not suspiciously small)?

Be lenient in your assessment since you cannot read the actual content.

Respond with JSON only:
{
  "isValid": true/false,
  "reason": "Brief explanation of why the document appears valid or invalid based on metadata"
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
