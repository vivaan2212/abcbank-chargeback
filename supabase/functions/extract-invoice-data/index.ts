import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { storagePath, bucket = 'dispute-documents' } = await req.json();
    
    if (!storagePath) {
      return new Response(JSON.stringify({ error: 'storagePath is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Fetching document from storage:', bucket, storagePath);
    
    // Download the document from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(storagePath);
    
    if (downloadError) {
      console.error('Storage download error:', downloadError);
      throw new Error(`Failed to download document: ${downloadError.message}`);
    }

    // Convert blob to base64 (process in chunks to avoid stack overflow)
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 8192;
    let binary = '';
    
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    const base64 = btoa(binary);
    
    // Determine mime type from file extension
    const ext = storagePath.toLowerCase().split('.').pop();
    const mimeType = ext === 'pdf' ? 'application/pdf' : 
                     ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                     ext === 'png' ? 'image/png' : 'application/octet-stream';

    // Only process image files - PDFs can't be extracted via vision API
    if (mimeType === 'application/pdf' || mimeType === 'application/octet-stream') {
      console.log('Skipping non-image file:', mimeType);
      return new Response(JSON.stringify({ 
        success: true,
        data: {
          vendor_name: 'Document uploaded',
          total: 'See document for details',
          note: 'PDF documents require manual review'
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Sending document to AI for extraction, type:', mimeType);

    // Use Lovable AI to extract invoice data
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract invoice details from this document. Look for: vendor/merchant name, invoice date, line items with descriptions and prices, subtotal, tax amount, total amount, and customer/buyer name if present. Return a structured response.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_invoice_fields',
              description: 'Extract structured invoice data',
              parameters: {
                type: 'object',
                properties: {
                  vendor_name: { type: 'string', description: 'Name of the vendor/merchant' },
                  invoice_date: { type: 'string', description: 'Date of the invoice' },
                  invoice_number: { type: 'string', description: 'Invoice number if present' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        description: { type: 'string' },
                        quantity: { type: 'string' },
                        price: { type: 'string' }
                      }
                    }
                  },
                  subtotal: { type: 'string', description: 'Subtotal amount' },
                  tax: { type: 'string', description: 'Tax amount' },
                  total: { type: 'string', description: 'Total amount' },
                  customer_name: { type: 'string', description: 'Customer/buyer name if present' },
                  currency: { type: 'string', description: 'Currency code or symbol' }
                },
                required: ['vendor_name', 'total'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_invoice_fields' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI extraction error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits required. Please add credits to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI extraction failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI response received');

    // Extract the tool call result
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No invoice data extracted from document');
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    console.log('Extracted invoice data:', extractedData);

    return new Response(JSON.stringify({ 
      success: true,
      data: extractedData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Extract invoice error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
