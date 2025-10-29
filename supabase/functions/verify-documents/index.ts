import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
            text: `You are verifying a document for a chargeback dispute. 
${disputeInfo}
The document should be: "${requirement.name}"
Expected types: ${requirement.uploadType.join(', ')}

Please analyze this image and determine:
1. Is this document relevant to the requirement "${requirement.name}"?
2. Does it contain the expected information given the dispute context?
3. Is the image clear and readable?

Be context-aware: If the customer claims they received the wrong item, a clear photo of what they actually received IS valid evidence, even if it doesn't show physical damage.

Respond with JSON only:
{
  "isValid": true/false,
  "reason": "Brief explanation of why the document is valid or invalid"
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
        // For PDFs, use enhanced metadata validation with dispute context
        // TODO: Implement PDF text extraction for full content analysis
        const disputeInfo = disputeContext 
          ? `

DISPUTE CONTEXT:
- Reason: ${disputeContext.reasonLabel}
- Customer's explanation: ${disputeContext.customReason || disputeContext.aiExplanation || 'Not provided'}
`
          : '';

        console.log(`Performing enhanced metadata validation for PDF: ${file.name}`);

        content = `You are verifying a PDF document for a chargeback dispute.
${disputeInfo}
The document should be: "${requirement.name}"
Expected types: ${requirement.uploadType.join(', ')}
File provided: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(2)} KB)

Note: Full PDF content reading is not yet available. Based on the filename, file type, size, and dispute context, assess if this document seems appropriate.

Consider:
1. Does the filename suggest it matches the requirement "${requirement.name}"?
2. Is it a PDF file (appropriate for documents like invoices, receipts, statements)?
3. Is the file size reasonable (typically 50KB - 5MB for legitimate documents)?
4. Given the dispute context, does the filename make sense?
   - For "wrong item received": look for invoice, receipt, or order confirmation keywords
   - For "not received": look for tracking, shipping, or delivery keywords
   - For "damaged/defective": look for receipt, warranty, or photo keywords
   - For "unauthorized": look for statement, report, or account keywords

Be moderately lenient since you cannot read the actual content, but flag obvious mismatches.

Respond with JSON only:
{
  "isValid": true/false,
  "reason": "Brief explanation based on filename analysis and context"
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
