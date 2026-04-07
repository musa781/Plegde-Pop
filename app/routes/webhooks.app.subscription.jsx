export async function action({ request }) {
  console.log('🔥🔥🔥 SUBSCRIPTION WEBHOOK TRIGGERED 🔥🔥🔥');
  console.log('Time:', new Date().toISOString());
  console.log('Headers:', JSON.stringify(Object.fromEntries(request.headers), null, 2));
  
  const rawBody = await request.text();
  console.log('Raw body:', rawBody);
  
  try {
    const payload = JSON.parse(rawBody);
    console.log('Parsed payload:', JSON.stringify(payload, null, 2));
    
    // Extract campaign ID
    let campaignId = null;
    if (payload.lineItems) {
      payload.lineItems.forEach(item => {
        if (item.customAttributes) {
          item.customAttributes.forEach(attr => {
            if (attr.key === '_campaign_id') {
              campaignId = attr.value;
              console.log('✅ Found campaign ID:', campaignId);
            }
          });
        }
      });
    }
    
    console.log('Returning response');
    return new Response('OK', { status: 200 });
  } catch (e) {
    console.error('Error:', e);
    return new Response('Error', { status: 500 });
  }
}