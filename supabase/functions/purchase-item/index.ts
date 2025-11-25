import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { itemName, currencyType, price, itemType } = await req.json();

    if (!itemName || !currencyType || !price || !itemType) {
      throw new Error('Missing required fields');
    }

    console.log(`Purchase request: ${itemName} for ${price} ${currencyType} by user ${user.id}`);

    // Get user's current currency
    const { data: currencyData, error: currencyError } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', user.id)
      .eq('item_name', currencyType)
      .single();

    if (currencyError || !currencyData) {
      return new Response(
        JSON.stringify({ error: `You don't have any ${currencyType}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (currencyData.quantity < price) {
      return new Response(
        JSON.stringify({ error: `Insufficient ${currencyType}. You need ${price} but only have ${currencyData.quantity}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduct currency
    const { error: deductError } = await supabase
      .from('inventory')
      .update({ quantity: currencyData.quantity - price })
      .eq('id', currencyData.id);

    if (deductError) {
      console.error('Error deducting currency:', deductError);
      throw new Error('Failed to deduct currency');
    }

    // Check if user already has the item
    const { data: existingItem, error: existingError } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', user.id)
      .eq('item_name', itemName)
      .maybeSingle();

    if (existingError) {
      console.error('Error checking existing item:', existingError);
      throw new Error('Failed to check existing item');
    }

    if (existingItem) {
      // Increase quantity
      const { error: updateError } = await supabase
        .from('inventory')
        .update({ quantity: existingItem.quantity + 1 })
        .eq('id', existingItem.id);

      if (updateError) {
        console.error('Error updating item quantity:', updateError);
        throw new Error('Failed to update item quantity');
      }
    } else {
      // Create new item entry
      const { error: insertError } = await supabase
        .from('inventory')
        .insert({
          user_id: user.id,
          item_name: itemName,
          item_type: itemType,
          quantity: 1
        });

      if (insertError) {
        console.error('Error creating new item:', insertError);
        throw new Error('Failed to create new item');
      }
    }

    console.log(`Purchase successful: ${itemName} for ${price} ${currencyType}`);

    return new Response(
      JSON.stringify({
        success: true,
        newBalance: currencyData.quantity - price
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Purchase error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
