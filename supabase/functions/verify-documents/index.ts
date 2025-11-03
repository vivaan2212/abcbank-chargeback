import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation function for filename matching
function validateFilename(
  fileName: string,
  requirementName: string,
  merchantName: string,
  userFullName: string
): { isValid: boolean; reason: string } {
  const fileNameLower = fileName.toLowerCase();
  const requirementLower = requirementName.toLowerCase();
  
  // Check if this is a bank statement requirement
  const isBankStatement = requirementLower.includes('bank statement');
  
  if (isBankStatement) {
    // For bank statements: validate against user's name
    const nameParts = userFullName.trim().split(/\s+/);
    const firstName = nameParts[0]?.toLowerCase();
    const lastName = nameParts[nameParts.length - 1]?.toLowerCase();
    
    // Check if filename contains first or last name (partial match)
    const hasFirstName = firstName && fileNameLower.includes(firstName);
    const hasLastName = lastName && lastName !== firstName && fileNameLower.includes(lastName);
    
    if (hasFirstName || hasLastName) {
      return {
        isValid: true,
        reason: "Bank statement filename contains your name"
      };
    }
    
    // ERROR: Simple message referencing the document type
    return {
      isValid: false,
      reason: `The submitted file is wrong, please submit the correct ${requirementName}.`
    };
  } else {
    // For merchant documents: validate against merchant name
    const merchantLower = merchantName.toLowerCase();
    
    if (fileNameLower.includes(merchantLower)) {
      return {
        isValid: true,
        reason: "Filename matches merchant name"
      };
    }
    
    // ERROR: Simple message referencing the document type
    return {
      isValid: false,
      reason: `The submitted file is wrong, please submit the correct ${requirementName}.`
    };
  }
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

    // Fetch transaction details to get merchant name
    const { data: transaction, error: txError } = await supabaseClient
      .from('transactions')
      .select('merchant_name')
      .eq('id', transactionId)
      .single();

    if (txError || !transaction) {
      throw new Error('Transaction not found');
    }

    // Fetch user profile to get full name
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('User profile not found');
    }

    const merchantName = transaction.merchant_name;
    const userFullName = profile.full_name;

    console.log('Validation context:', { merchantName, userFullName, transactionId, disputeId });

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

      console.log(`Validating document: ${file.name} for requirement: ${requirement.name}`);

      // Perform filename validation
      const validation = validateFilename(
        file.name,
        requirement.name,
        merchantName,
        userFullName
      );

      verificationResults.push({
        requirementName: requirement.name,
        fileName: file.name,
        isValid: validation.isValid,
        reason: validation.reason
      });

      console.log(`Validation result for ${file.name}:`, validation);

      // If document is valid, upload to storage and save metadata
      if (validation.isValid) {
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
