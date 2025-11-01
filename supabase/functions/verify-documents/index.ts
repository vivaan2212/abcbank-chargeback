import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to strip markdown code fences from JSON
function stripMarkdownCodeFences(content: string): string {
  // Remove ```json and ``` or just ``` from the content
  return content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
}

// Helper function to get VERY lenient document-type-specific guidance (for testing)
function getDocumentTypeRequirements(requirementName: string): string {
  return `TESTING MODE - EXTREMELY LENIENT VERIFICATION:

✅ ACCEPT if:
- Document is readable (not completely blank or corrupted)
- Has any text, images, or content visible
- Appears to be a real document (not just noise)

❌ ONLY REJECT if:
- Completely blank/empty file
- Totally corrupted and unreadable
- Just random noise with no discernible content

For requirement: "${requirementName}"
Accept almost anything that looks like a document.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const formData = await req.formData();
    const requirementsJson = formData.get('requirements') as string;
    const requirements = JSON.parse(requirementsJson);
    const disputeContextJson = formData.get('disputeContext') as string;
    const disputeContext = disputeContextJson ? JSON.parse(disputeContextJson) : null;
    const disputeId = formData.get('disputeId') as string;
    const transactionId = formData.get('transactionId') as string;

    if (!disputeId || !transactionId) {
      throw new Error('disputeId and transactionId are required');
    }

    console.log('Verifying and storing documents:', { requirements, disputeContext, disputeId, transactionId });

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
            text: `TESTING MODE: You are an extremely lenient image verifier.

Your job: Accept almost any readable image as valid.

ONLY reject if:
- Image is completely blank/corrupted
- Image is entirely unreadable (pure noise)
- File appears to be damaged/empty

ACCEPT if:
- Image contains any visible text or content
- Image shows any document, receipt, screenshot, photo, or written content
- Image is somewhat readable (even if blurry or low quality)

${disputeInfo}

REQUIREMENT: "${requirement.name}"
Expected types: ${requirement.uploadType.join(', ')}

${getDocumentTypeRequirements(requirement.name)}

Output (JSON only):
{
  "isValid": true|false,
  "reason": "Brief explanation"
}

Example valid response:
{"isValid": true, "reason":"Document is readable and contains content"}

Be extremely lenient - accept almost everything.`
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
        content = `TESTING MODE: You are an extremely lenient PDF verifier.

Your job: Accept almost any readable PDF as valid.

ONLY reject if:
- PDF is completely blank/corrupted
- PDF is entirely unreadable (no text extractable)
- File appears to be damaged/empty

ACCEPT if:
- PDF contains any visible text or content
- PDF shows any document, receipt, statement, or written content
- PDF is somewhat readable (even if low quality)

${disputeInfo}

REQUIREMENT: "${requirement.name}"
Expected types: ${requirement.uploadType.join(', ')}

${getDocumentTypeRequirements(requirement.name)}

PDF Document (base64-encoded):
${base64}

Output (JSON only):
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
      const cleanedContent = stripMarkdownCodeFences(aiContent);
      console.log('Cleaned AI content:', cleanedContent);
      const verification = JSON.parse(cleanedContent);

      verificationResults.push({
        requirementName: requirement.name,
        fileName: file.name,
        isValid: verification.isValid,
        reason: verification.reason
      });

      console.log(`Verification result for ${file.name}:`, verification);

      // If document is valid, upload to storage and save metadata
      if (verification.isValid) {
        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        const storagePath = `${user.id}/${disputeId}/${timestamp}-${requirement.name.replace(/\s+/g, '_')}.${fileExt}`;
        
        console.log(`Uploading document to storage: ${storagePath}`);
        
        // Upload to Supabase Storage
        const { error: uploadError } = await supabaseClient.storage
          .from('dispute-documents')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          throw new Error(`Failed to upload document: ${uploadError.message}`);
        }

        // Save metadata to database
        const { error: dbError } = await supabaseClient
          .from('dispute_documents')
          .insert({
            dispute_id: disputeId,
            transaction_id: transactionId,
            customer_id: user.id,
            requirement_name: requirement.name,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
            storage_path: storagePath
          });

        if (dbError) {
          console.error('Database insert error:', dbError);
          throw new Error(`Failed to save document metadata: ${dbError.message}`);
        }

        console.log(`Successfully stored document: ${file.name}`);
      }
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
