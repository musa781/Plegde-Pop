// app/routes/webhooks.app.orders-paid.jsx
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  console.log("🔔 Orders paid webhook received");

  let admin = null;
  let payload = null;

  try {
    const auth = await authenticate.webhook(request);
    admin = auth.admin;
    payload = auth.payload;
    console.log("✅ AUTH SUCCESS");
    console.log("✅ Order ID:", payload.id);
    console.log("✅ Customer:", payload.customer?.email);
  } catch (e) {
    console.error("❌ Auth failed:", e.message);
    return new Response("OK", { status: 200 });
  }

  // =============================================
  // CHECK IF THIS IS A BALANCE PAYMENT ORDER
  // =============================================
  let isBalancePayment = false;
  let backerId = null;

  for (const line of payload.line_items) {
    if (line.properties) {
      let propsArray = line.properties;
      if (!Array.isArray(propsArray)) {
        propsArray = Object.entries(propsArray || {}).map(([k, v]) => ({ name: k, value: v }));
      }

      const typeProp = propsArray.find(p => p.name === "_type");
      if (typeProp && typeProp.value === "balance_payment") {
        isBalancePayment = true;
        const backerIdProp = propsArray.find(p => p.name === "_backer_id");
        if (backerIdProp) backerId = backerIdProp.value;
        break;
      }
    }
  }

  if (isBalancePayment && backerId) {
    console.log("💰 Balance payment received for backer:", backerId);

    await prisma.backer.update({
      where: { id: backerId },
      data: {
        remainingAmount: 0,
        balancePaidAt: new Date(),
        paymentStatus: "captured",   // ✅ Add this line
        capturedAt: new Date()       // ✅ Also set captured timestamp
      }
    });

    await addTimelineNote(admin, payload.id, `Balance payment of $${payload.total_price} received. Thank you for completing your pledge!`);

    console.log("✅ Balance payment recorded");
    return new Response("OK", { status: 200 });
  }

  // =============================================
  // NORMAL DEPOSIT ORDER HANDLING
  // =============================================

  let campaignId = null;
  if (payload.line_items?.[0]?.properties) {
    const props = payload.line_items[0].properties;
    if (Array.isArray(props)) {
      campaignId = props.find((p) => p.name === "_campaign_id")?.value;
    } else {
      campaignId = props._campaign_id;
    }
  }

  if (!campaignId) {
    console.log("❌ Not a campaign order");
    return new Response("OK", { status: 200 });
  }

  console.log("🎯 Campaign ID:", campaignId);

  const existingBacker = await prisma.backer.findUnique({
    where: { orderId: String(payload.id) },
  });

  if (existingBacker) {
    console.log("⚠️ Order already exists, skipping");
    return new Response("OK", { status: 200 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    console.log("❌ Campaign not found");
    return new Response("OK", { status: 200 });
  }

  const orderTotal = parseFloat(payload.total_price) || 0;
  const newRaisedAmount = (campaign.raisedAmount || 0) + orderTotal;
  const targetAmount = (campaign.basePledge || 1) * (campaign.targetUnits || 1);
  const fundingPercentage = (newRaisedAmount / targetAmount) * 100;

  console.log(`📊 Funding: ${fundingPercentage.toFixed(2)}%`);
  console.log(`🎯 Target: $${targetAmount}`);
  console.log(`💰 Raised: $${newRaisedAmount}`);

  const productPrice = parseFloat(campaign.originalPrice);
  const pledgeAmount = campaign.basePledge || 2;
  const remainingAmount = productPrice - pledgeAmount;

  const backer = await prisma.backer.create({
    data: {
      campaignId: campaignId,
      orderId: String(payload.id),
      orderNumber: payload.order_number?.toString(),
      customerName: payload.customer?.first_name + " " + payload.customer?.last_name,
      customerEmail: payload.customer?.email,
      pledgeAmount: campaign.basePledge || 2,
      totalAmount: orderTotal,
      paymentStatus: "pending",
      remainingAmount: remainingAmount,
    },
  });
  console.log("✅ Backer saved with ID:", backer.id);
  console.log(`   Remaining amount: $${remainingAmount}`);

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      raisedAmount: newRaisedAmount,
      backersCount: { increment: 1 },
      fundingPercentage: fundingPercentage,
    },
  });
  console.log("✅ Campaign updated");

  if (fundingPercentage >= 100 && !campaign.autoCaptureTriggered) {
    console.log("\n🎉🎉🎉 CAMPAIGN COMPLETED! 🎉🎉🎉");

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        autoCaptureTriggered: true,
        capturedAt: new Date(),
      },
    });
    console.log("✅ Campaign marked as completed");

    console.log("\n📧 Sending balance invoices...");
    try {
      // Dynamic import to avoid circular dependency
      const { triggerAutoCapture } = await import("../utils/autoCapture.js");
      const result = await triggerAutoCapture(campaignId, admin);
      console.log("✅ Balance invoices sent:", result);
    } catch (error) {
      console.error("❌ Failed to send balance invoices:", error.message);
    }
  } else if (fundingPercentage >= 100 && campaign.autoCaptureTriggered) {
    console.log("ℹ️ Campaign already completed");
  } else {
    console.log(`⏳ Need ${(100 - fundingPercentage).toFixed(2)}% more`);
  }

  return new Response("OK", { status: 200 });
}

async function addTimelineNote(admin, orderId, message) {
  try {
    const orderGid = `gid://shopify/Order/${orderId}`;
    await admin.graphql(
      `mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            id: orderGid,
            note: message,
          },
        },
      }
    );
    console.log("📝 Timeline note added");
  } catch (e) {
    console.warn("Timeline note failed:", e.message);
  }
}