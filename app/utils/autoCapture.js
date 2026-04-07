// app/utils/autoCapture.js

import prisma from "../db.server";


// =============================================
// ✅ Check if order is already captured
// =============================================
async function isOrderAlreadyCaptured(orderId, admin) {
  const orderGid = `gid://shopify/Order/${orderId}`;
  const query = `
    query getTransactions($id: ID!) {
      order(id: $id) {
        transactions {
          kind
          status
        }
      }
    }
  `;
  try {
    const response = await admin.graphql(query, { variables: { id: orderGid } });
    const json = await response.json();
    const transactions = json.data?.order?.transactions || [];
    const captured = transactions.some(t => t.kind === 'CAPTURE' && t.status === 'SUCCESS');
    return captured;
  } catch (error) {
    console.warn("Error checking capture status:", error.message);
    return false; // assume not captured to be safe
  }
}

// =============================================
// 🚀 MAIN FUNCTION: Capture deposits + Send balance invoices
// =============================================
export async function triggerAutoCapture(campaignId, admin) {
  console.log(`🚀 Processing campaign completion: ${campaignId}`);
  
  try {
    // =============================================
    // STEP 1: Capture all pending deposits
    // =============================================
    const pendingBackers = await prisma.backer.findMany({
      where: {
        campaignId: campaignId,
        paymentStatus: "pending",  // Only pending deposits
      }
    });
    
    if (pendingBackers.length > 0) {
      console.log(`💰 Capturing ${pendingBackers.length} pending deposits...`);
      
      for (const backer of pendingBackers) {
        try {
          console.log(`   Capturing deposit for backer ${backer.id} (Order ${backer.orderId})`);
          const captureResult = await captureDeposit(admin, backer);
          
          if (captureResult.success) {
            await prisma.backer.update({
              where: { id: backer.id },
              data: {
                paymentStatus: "captured",
                capturedAt: new Date()
              }
            });
            console.log(`   ✅ Deposit captured for ${backer.customerEmail} - $${backer.totalAmount}`);
          } else {
            console.error(`   ❌ Deposit capture failed for ${backer.customerEmail}: ${captureResult.error}`);
            // Still continue to send balance invoice? Yes, because customer still owes balance
          }
        } catch (error) {
          console.error(`   ❌ Error capturing deposit for backer ${backer.id}:`, error.message);
        }
      }
    } else {
      console.log("💰 No pending deposits to capture");
    }
    
    // =============================================
    // STEP 2: Send balance invoices for remaining amount
    // =============================================
    const balanceBackers = await prisma.backer.findMany({
      where: {
        campaignId: campaignId,
        remainingAmount: { gt: 0 },
        balanceInvoiceSent: false
      }
    });
    
    if (balanceBackers.length === 0) {
      console.log("✅ No balance invoices to send");
      return { success: true, message: "Deposits captured, no balances pending" };
    }
    
    console.log(`📧 Sending balance invoices to ${balanceBackers.length} backers...`);
    
    const results = { success: [], failed: [] };
    
    for (const backer of balanceBackers) {
      try {
        console.log(`\n📝 Processing balance for: ${backer.customerName} (${backer.customerEmail})`);
        console.log(`   Remaining amount: $${backer.remainingAmount}`);
        
        const draftOrder = await createBalanceDraftOrder(admin, backer);
        await sendBalanceInvoice(admin, draftOrder.id);
        
        await prisma.backer.update({
          where: { id: backer.id },
          data: {
            balanceInvoiceSent: true,
            balanceInvoiceSentAt: new Date(),
            balanceOrderId: draftOrder.id
          }
        });
        
        results.success.push({
          id: backer.id,
          email: backer.customerEmail,
          amount: backer.remainingAmount,
          invoiceUrl: draftOrder.invoiceUrl
        });
        
        console.log(`✅ Balance invoice sent to ${backer.customerEmail}`);
        
      } catch (error) {
        console.error(`❌ Failed for backer ${backer.id}:`, error.message);
        results.failed.push({
          id: backer.id,
          email: backer.customerEmail,
          error: error.message
        });
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   💰 Deposits captured: ${pendingBackers.length}`);
    console.log(`   📧 Balance invoices sent: ${results.success.length}`);
    console.log(`   ❌ Failed: ${results.failed.length}`);
    
    return { depositsCaptured: pendingBackers.length, balanceInvoices: results };
    
  } catch (error) {
    console.error("❌ triggerAutoCapture error:", error);
    throw error;
  }
}

// =============================================
// 💰 CAPTURE DEPOSIT (using Shopify orderCapture)
// =============================================

async function captureDeposit(admin, backer) {
  try {
    // Check if already captured
    const alreadyCaptured = await isOrderAlreadyCaptured(backer.orderId, admin);
    if (alreadyCaptured) {
      console.log(`   ⚠️ Deposit already captured for order ${backer.orderId}, skipping.`);
      return { success: true, alreadyCaptured: true };
    }

    // Get the authorization transaction ID
    const authTransactionId = await getAuthorizationTransaction(backer.orderId, admin);
    
    const mutation = `
      mutation orderCapture($input: OrderCaptureInput!) {
        orderCapture(input: $input) {
          transaction { id status }
          userErrors { field message }
        }
      }
    `;
    
    const variables = {
      input: {
        id: `gid://shopify/Order/${backer.orderId}`,
        parentTransactionId: authTransactionId,
        amount: backer.totalAmount.toString()
      }
    };
    
    const response = await admin.graphql(mutation, { variables });
    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }
    
    if (data.data?.orderCapture?.userErrors?.length) {
      throw new Error(data.data.orderCapture.userErrors[0].message);
    }
    
    return { success: true, transactionId: data.data.orderCapture.transaction.id };
    
  } catch (error) {
    // Log the error but don't throw – allow balance invoices to still be sent
    console.error(`   ❌ Deposit capture error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// =============================================
// 🔍 HELPER: Get authorization transaction ID
// =============================================
async function getAuthorizationTransaction(orderId, admin) {
  const orderGid = `gid://shopify/Order/${orderId}`;
  
  const query = `
    query getTransactions($id: ID!) {
      order(id: $id) {
        transactions {
          id
          kind
          status
        }
      }
    }
  `;
  
  const response = await admin.graphql(query, { variables: { id: orderGid } });
  const json = await response.json();
  const transactions = json.data?.order?.transactions || [];
  
  const auth = transactions.find(t => t.kind === 'AUTHORIZATION' && t.status === 'SUCCESS');
  if (!auth) {
    throw new Error(`No successful authorization found for order ${orderId}`);
  }
  
  return auth.id;
}

// =============================================
// 🆕 Create draft order for balance amount
// =============================================
async function createBalanceDraftOrder(admin, backer) {
  const mutation = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          invoiceUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const campaign = await prisma.campaign.findUnique({
    where: { id: backer.campaignId }
  });
  
  const lineItemTitle = `${campaign?.productTitle || "Product"} - Balance Payment`;
  
  const variables = {
    input: {
      lineItems: [
        {
          title: lineItemTitle,
          quantity: 1,
          originalUnitPrice: backer.remainingAmount.toString(),
          customAttributes: [
            { key: "_campaign_id", value: backer.campaignId },
            { key: "_backer_id", value: backer.id },
            { key: "_type", value: "balance_payment" }
          ]
        }
      ],
      email: backer.customerEmail,
      billingAddress: {
        firstName: backer.customerName?.split(' ')[0] || "",
        lastName: backer.customerName?.split(' ')[1] || "",
        address1: "",
        city: "",
        province: "",
        country: "",
        zip: ""
      },
      tags: ["pledgepop-balance", backer.campaignId],
      note: `Balance payment for campaign ${campaign?.campaignTitle || backer.campaignId}. Original order ID: ${backer.orderId}`
    }
  };
  
  const response = await admin.graphql(mutation, { variables });
  const data = await response.json();
  
  if (data.errors) {
    throw new Error(data.errors[0].message);
  }
  
  if (data.data?.draftOrderCreate?.userErrors?.length) {
    throw new Error(data.data.draftOrderCreate.userErrors[0].message);
  }
  
  console.log(`   ✅ Draft order created: ${data.data.draftOrderCreate.draftOrder.id}`);
  return data.data.draftOrderCreate.draftOrder;
}

// =============================================
// 📧 Send balance invoice
// =============================================
async function sendBalanceInvoice(admin, draftOrderId) {
  const mutation = `
    mutation draftOrderInvoiceSend($id: ID!) {
      draftOrderInvoiceSend(id: $id) {
        draftOrder {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const response = await admin.graphql(mutation, { variables: { id: draftOrderId } });
  const data = await response.json();
  
  if (data.data?.draftOrderInvoiceSend?.userErrors?.length) {
    console.warn("Invoice send warning:", data.data.draftOrderInvoiceSend.userErrors);
  }
  
  console.log(`   📧 Invoice sent for draft order: ${draftOrderId}`);
}