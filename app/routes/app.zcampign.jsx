// // // How Everything Connects (The Complete Flow)
// // // Merchant creates a campaign using the form (app.campaigns._index.jsx).
// // // → The app saves the campaign in the database, creates a selling plan (if pledge mode), and sets a metafield on the product.

// // // Customer views the product page.
// // // → The Liquid widget (campaign-preview.liquid) reads the metafield and displays the campaign banner.

// // // Customer clicks the pledge button.
// // // → campaign.js opens a modal where they choose addons and (optionally) a subscription plan.
// // // → When they confirm, the items are added to the cart and they are redirected to Shopify checkout.

// // // Customer pays.
// // // → Shopify processes the payment and triggers the ORDERS_PAID webhook (webhooks.app.orders-paid.jsx).
// // // → The app records the backer and updates the campaign’s raised amount.

// // // Campaign reaches 100% funding.
// // // → The webhook calls autoCapture.js, which captures payments from all pending backers, sends invoices, and marks them as captured.
// // // → A timeline note is added to each order.

// // // Merchant monitors progress.
// // // → On the dashboard (app.dashboard.jsx), they see an overview of all campaigns.
// // // → Clicking on a campaign takes them to the details page (app.campaigns.$id.jsx), where they can view backers, payment status, and manually capture payments if needed.







































// // // app/routes/webhooks.app.orders-paid.jsx
// // import prisma from "../db.server";
// // import { triggerAutoCapture } from "../utils/autoCapture";
// // import { authenticate } from "../shopify.server";

// // export async function action({ request }) {
// //   console.log("🔔 Orders paid webhook received");

// //   let admin = null;
// //   let payload = null;

// //   try {
// //     const auth = await authenticate.webhook(request);
// //     admin = auth.admin;
// //     payload = auth.payload;

// //     console.log("✅ AUTH SUCCESS");
// //     console.log("✅ Order ID:", payload.id);
// //     console.log("✅ Customer:", payload.customer?.email);
// //   } catch (e) {
// //     console.error("❌ Auth failed:", e.message);
// //     return new Response("OK", { status: 200 });
// //   }

// //   // Find campaign ID
// //   let campaignId = null;
// //   if (payload.line_items?.[0]?.properties) {
// //     const props = payload.line_items[0].properties;
// //     if (Array.isArray(props)) {
// //       campaignId = props.find((p) => p.name === "_campaign_id")?.value;
// //     } else {
// //       campaignId = props._campaign_id;
// //     }
// //   }

// //   if (!campaignId) {
// //     console.log("❌ Not a campaign order");
// //     return new Response("OK", { status: 200 });
// //   }

// //   console.log("🎯 Campaign ID:", campaignId);

// //   // Check if order already exists
// //   const existingBacker = await prisma.backer.findUnique({
// //     where: { orderId: String(payload.id) },
// //   });

// //   if (existingBacker) {
// //     console.log("⚠️ Order already exists, skipping");
// //     return new Response("OK", { status: 200 });
// //   }

// //   const campaign = await prisma.campaign.findUnique({
// //     where: { id: campaignId },
// //   });

// //   if (!campaign) {
// //     console.log("❌ Campaign not found");
// //     return new Response("OK", { status: 200 });
// //   }

// //   const orderTotal = parseFloat(payload.total_price) || 0;
// //   const newRaisedAmount = (campaign.raisedAmount || 0) + orderTotal;
// //   const targetAmount = (campaign.basePledge || 1) * (campaign.targetUnits || 1);
// //   const fundingPercentage = (newRaisedAmount / targetAmount) * 100;

// //   console.log(`📊 Funding: ${fundingPercentage.toFixed(2)}%`);
// //   console.log(`🎯 Target: $${targetAmount}`);
// //   console.log(`💰 Raised: $${newRaisedAmount}`);

// //   // Save backer
// //   const backer = await prisma.backer.create({
// //     data: {
// //       campaignId: campaignId,
// //       orderId: String(payload.id),
// //       orderNumber: payload.order_number?.toString(),
// //       customerName:
// //         payload.customer?.first_name + " " + payload.customer?.last_name,
// //       customerEmail: payload.customer?.email,
// //       pledgeAmount: campaign.basePledge || 2,
// //       totalAmount: orderTotal,
// //       paymentStatus: "pending",
// //     },
// //   });
// //   console.log("✅ Backer saved with ID:", backer.id);

// //   // Update campaign
// //   await prisma.campaign.update({
// //     where: { id: campaignId },
// //     data: {
// //       raisedAmount: newRaisedAmount,
// //       backersCount: { increment: 1 },
// //       fundingPercentage: fundingPercentage,
// //     },
// //   });
// //   console.log("✅ Campaign updated");

// //   // =============================================
// //   // 🔴 WHEN 100% REACHED
// //   // =============================================
// //   if (fundingPercentage >= 100 && !campaign.autoCaptureTriggered) {
// //     console.log("\n🎉🎉🎉 CAMPAIGN COMPLETED! 🎉🎉🎉");

// //     // Mark campaign as completed
// //     await prisma.campaign.update({
// //       where: { id: campaignId },
// //       data: {
// //         autoCaptureTriggered: true,
// //         capturedAt: new Date(),
// //       },
// //     });
// //     console.log("✅ Campaign marked as completed");

// //     // 🔴 STEP 1: AUTO-CAPTURE PAYMENT (using admin)
// //     console.log("\n💰 STEP 1: Auto-capturing payment...");
// //     let captureSuccess = false;
// //     try {
// //       const captureResult = await triggerAutoCapture(campaignId, admin);
// //       if (captureResult && captureResult.success) {
// //         captureSuccess = true;
// //         console.log("✅ Payment captured successfully!");
// //       } else {
// //         console.log("⚠️ Payment capture failed");
// //       }
// //     } catch (error) {
// //       console.log("⚠️ Auto-capture error:", error.message);
// //     }

// //     // 🔴 STEP 2: MARK INVOICE AS SENT IN DATABASE
// //     console.log("\n📧 STEP 2: Marking invoice as sent in database...");
// //     const updatedBacker = await prisma.backer.update({
// //       where: { id: backer.id },
// //       data: {
// //         invoiceSent: true,
// //         invoiceSentAt: new Date(),
// //       },
// //     });

// //     console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
// //     console.log("✅ INVOICE MARKED AS SENT!");
// //     console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
// //     console.log(`   Backer ID: ${updatedBacker.id}`);
// //     console.log(`   invoiceSent: ${updatedBacker.invoiceSent}`);
// //     console.log(`   invoiceSentAt: ${updatedBacker.invoiceSentAt}`);
// //     console.log(`   Customer: ${updatedBacker.customerEmail}`);
// //     console.log(`   Order #: ${updatedBacker.orderNumber}`);
// //     console.log(`   Amount: $${updatedBacker.totalAmount}`);
// //     console.log(`   Capture Status: ${captureSuccess ? "Success" : "Failed"}`);
// //     console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// //     // 🔴 STEP 3: ADD INVOICE TIMELINE NOTE (works for paid orders)
// //     console.log("\n📧 STEP 3: Adding invoice timeline note...");
// //     await addInvoiceTimelineNote(admin, payload, backer, campaign);
// //   } else if (fundingPercentage >= 100 && campaign.autoCaptureTriggered) {
// //     console.log("ℹ️ Campaign already completed");
// //   } else {
// //     console.log(`⏳ Need ${(100 - fundingPercentage).toFixed(2)}% more`);
// //   }

// //   return new Response("OK", { status: 200 });
// // }

// // // =============================================
// // // 📋 ADD INVOICE TIMELINE NOTE (FALLBACK)
// // // =============================================
// // async function addInvoiceTimelineNote(admin, payload, backer, campaign) {
// //   if (!admin || !admin.graphql) {
// //     console.log("⚠️ No admin available — skipping timeline note");
// //     return;
// //   }

// //   try {
// //     const orderGid = `gid://shopify/Order/${payload.id}`;
// //     const invoiceNumber = `INV-${campaign.id.slice(-8)}-${Date.now()}`;

// //     const note = `📄 **CAMPAIGN INVOICE**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Invoice #: ${invoiceNumber}\n• Date: ${new Date().toLocaleDateString()}\n• Amount: $${backer.totalAmount.toFixed(2)}\n• Status: ✅ Paid\n• Campaign: ${campaign.campaignTitle}\n• Backer ID: ${backer.id}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nThank you for supporting this campaign!`;

// //     const response = await admin.graphql(
// //       `#graphql
// //   mutation orderUpdate($input: OrderInput!) {
// //     orderUpdate(input: $input) {
// //       order {
// //         id
// //         note
// //       }
// //       userErrors {
// //         field
// //         message
// //       }
// //     }
// //   }`,
// //       {
// //         variables: {
// //           input: {
// //             id: orderGid,
// //             note: note, // Aapka naya note yahan jayega
// //           },
// //         },
// //       },
// //     );

// //     const data = await response.json();
// //     if (data.data?.orderNoteAdd?.userErrors?.length) {
// //       console.warn(
// //         "Timeline note userErrors:",
// //         data.data.orderNoteAdd.userErrors,
// //       );
// //     } else {
// //       console.log("✅ INVOICE TIMELINE NOTE ADDED!");
// //     }
// //   } catch (error) {
// //     console.error("❌ Failed to add timeline note:", error.message);
// //   }
// // }











































// //app/utils/autoCapture.js

// import prisma from "../db.server";


// // =============================================
// // 🚀 MAIN AUTO-CAPTURE FUNCTION
// // =============================================
// export async function triggerAutoCapture(campaignId, admin) {
//   console.log(`🚀 Starting real auto-capture for campaign: ${campaignId}`);
  
//   try {
//     // Get all pending backers
//     const pendingBackers = await prisma.backer.findMany({
//       where: { 
//         campaignId: campaignId,
//         paymentStatus: 'pending'
//       }
//     });
    
//     console.log(`Found ${pendingBackers.length} pending backers to capture`);
    
//     const results = {
//       success: [],
//       failed: []
//     };
    
//     // Process each backer
//     for (const backer of pendingBackers) {
//       try {
//         console.log(`\n🔄 Processing backer: ${backer.customerName} (${backer.orderId})`);
        
//         // =============================================
//         // STEP 1: CAPTURE PAYMENT (REAL)
//         // =============================================
//         const captureResult = await capturePayment(backer, admin);
        
//         if (captureResult.success) {
//           // =============================================
//           // STEP 2: SEND INVOICE (REAL) + TIMELINE UPDATE
//           // =============================================
//           const invoiceResult = await sendInvoice(backer, admin);
          
//           // =============================================
//           // STEP 3: UPDATE DATABASE
//           // =============================================
//           await prisma.backer.update({
//             where: { id: backer.id },
//             data: { 
//               paymentStatus: 'captured',
//               capturedAt: new Date(),
//               invoiceSent: invoiceResult.success,
//               invoiceSentAt: invoiceResult.success ? new Date() : null
//             }
//           });
          
//           results.success.push(backer);
//           console.log(`✅ SUCCESS: ${backer.customerName} - $${backer.totalAmount}`);
//           console.log(`   📧 Invoice sent: ${invoiceResult.success ? 'Yes' : 'No'}`);
//           console.log(`   📋 Timeline updated automatically`);
          
//         } else {
//           // Payment failed
//           await prisma.backer.update({
//             where: { id: backer.id },
//             data: { 
//               paymentStatus: 'failed',
//               errorMessage: captureResult.error
//             }
//           });
//           results.failed.push(backer);
//           console.log(`❌ FAILED: ${backer.customerName} - ${captureResult.error}`);
//         }
        
//       } catch (error) {
//         console.error(`Error processing backer ${backer.id}:`, error);
//         results.failed.push(backer);
//       }
//     }
    
//     // Summary
//     console.log(`\n📊 Auto-capture complete:`);
//     console.log(`   ✅ Successful: ${results.success.length}`);
//     console.log(`   ❌ Failed: ${results.failed.length}`);
    
//     return results;
    
//   } catch (error) {
//     console.error('❌ Auto-capture error:', error);
//     throw error;
//   }
// }

// // =============================================
// // 💰 CAPTURE PAYMENT (REAL SHOPIFY API)
// // =============================================
// async function capturePayment(backer, admin) {
//   console.log(`   💰 Capturing payment for order: ${backer.orderId}`);
  
//   try {
//     // 1. GET THE ID FIRST
//     const parentId = await getAuthorizationTransaction(backer.orderId, admin);
    
//     const response = await admin.graphql(
//       `#graphql
//       mutation orderCapture($input: OrderCaptureInput!) {
//         orderCapture(input: $input) {
//           transaction { id status }
//           userErrors { field message }
//         }
//       }`,
//       {
//         variables: {
//           input: {
//             id: `gid://shopify/Order/${backer.orderId}`,
//             parentTransactionId: parentId, // <--- ADDED THIS
//             amount: backer.totalAmount.toString(), // <--- CHANGED TO STRING
               
//           }
//         }
//       }
//     );
    
//     const data = await response.json();
    
//     // Check for errors
//     if (data.errors) {
//       throw new Error(data.errors[0].message);
//     }
    
//     if (data.data?.orderCapture?.userErrors?.length > 0) {
//       throw new Error(data.data.orderCapture.userErrors[0].message);
//     }
    
//     const transaction = data.data.orderCapture.transaction;
//     console.log(`   ✅ Payment captured! Transaction ID: ${transaction.id}`);
    
//     return { success: true, transactionId: transaction.id };
    
//   } catch (error) {
//     console.log(`   ❌ Payment capture failed: ${error.message}`);
//     return { success: false, error: error.message };
//   }
// }

// // =============================================
// // 📧 SEND INVOICE (REAL SHOPIFY API) + TIMELINE UPDATE
// // =============================================
// async function sendInvoice(backer, admin) {
//   console.log(`   📧 Sending invoice for order: ${backer.orderId}`);
  
//   try {
//     const orderGid = `gid://shopify/Order/${backer.orderId}`;
    
//     const response = await admin.graphql(
//       `mutation orderInvoiceSend($id: ID!, $email: EmailInput) {
//         orderInvoiceSend(id: $id, email: $email) {
//           order {
//             id
//             confirmed
//             invoiceUrl
//             timeline {
//               edges {
//                 node {
//                   message
//                   timestamp
//                 }
//               }
//             }
//           }
//           userErrors {
//             field
//             message
//           }
//         }
//       }`,
//       {
//         variables: {
//           id: orderGid,
//           email: {
//             to: backer.customerEmail || "customer@example.com",
//             // from: `store@${backer.customerEmail?.split('@')[1] || 'myshopify.com'}`,
//             subject: `Invoice for your pledge - Order #${backer.orderNumber || ''}`,
//             customMessage: `Thank you for supporting this campaign! Your pledge of $${backer.totalAmount} has been successfully captured.`
//           }
//         }
//       }
//     );
    
//     const data = await response.json();
    
//     if (data.errors) {
//       throw new Error(data.errors[0].message);
//     }
    
//     if (data.data?.orderInvoiceSend?.userErrors?.length > 0) {
//       throw new Error(data.data.orderInvoiceSend.userErrors[0].message);
//     }
    
//     console.log(`   ✅ Invoice sent to: ${backer.customerEmail}`);
//     console.log(`   📋 Timeline updated with invoice entry`);
    
//     return { success: true };
    
//   } catch (error) {
//     console.log(`   ❌ Invoice send failed: ${error.message}`);
//     return { success: false, error: error.message };
//   }
// }



// // HELPER TO GET THE TRANSACTION ID
// async function getAuthorizationTransaction(orderId, admin) {
//   const orderGid = `gid://shopify/Order/${orderId}`;
  
//   const response = await admin.graphql(
//     `#graphql
//     query getTransactions($id: ID!) {
//       order(id: $id) {
//         transactions {
//           id
//           kind
//           status
//         }
//       }
//     }`,
//     { variables: { id: orderGid } }
//   );

//   const json = await response.json();
//   const transactions = json.data?.order?.transactions || [];
  
//   // Find the successful authorization needed for capture
//   const auth = transactions.find(t => t.kind === 'AUTHORIZATION' && t.status === 'SUCCESS');
  
//   if (!auth) {
//     throw new Error(`No successful authorization found for order ${orderId}`);
//   }
  
//   return auth.id;
// }