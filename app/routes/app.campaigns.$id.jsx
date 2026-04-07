/* eslint-disable react/prop-types */
// app/routes/app.campaigns.$id.jsx
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useEffect } from "react";

export async function loader({ params, request }) {
  console.log("🔥 Loader called for campaign:", params.id);

  const { session } = await authenticate.admin(request);

  const campaign = await prisma.campaign.findUnique({
    where: {
      id: params.id,
      shop: session.shop,
    },
    include: {
      backers: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!campaign) throw new Error("Campaign not found");

  // Group backers by status
  const pendingBackers = campaign.backers.filter(
    (b) => b.paymentStatus === "pending",
  );
  const capturedBackers = campaign.backers.filter(
    (b) => b.paymentStatus === "captured",
  );
  const failedBackers = campaign.backers.filter(
    (b) => b.paymentStatus === "failed",
  );

  // Calculate totals
  const totalRaised = campaign.backers.reduce(
    (sum, b) => sum + b.totalAmount,
    0,
  );
  const totalCaptured = capturedBackers.reduce(
    (sum, b) => sum + b.totalAmount,
    0,
  );
  const totalPending = pendingBackers.reduce(
    (sum, b) => sum + b.totalAmount,
    0,
  );

  return {
    campaign,
    pendingBackers,
    capturedBackers,
    failedBackers,
    stats: {
      totalBackers: campaign.backers.length,
      totalRaised,
      totalCaptured,
      totalPending,
      pendingCount: pendingBackers.length,
      capturedCount: capturedBackers.length,
      failedCount: failedBackers.length,
    },
  };
}

// =============================================
// ACTION - Handle payment capture (MANUAL - COMMENTED OUT)
// Auto-capture is now handled by webhook + autoCapture.js
// =============================================
// export async function action({ params }) {
//   console.log("💰 Processing payment capture for campaign:", params.id);
//
//   try {
//     const pendingBackers = await prisma.backer.findMany({
//       where: {
//         campaignId: params.id,
//         paymentStatus: "pending",
//       },
//     });
//
//     console.log(`Found ${pendingBackers.length} pending backers`);
//
//     const results = { success: [], failed: [] };
//
//     for (const backer of pendingBackers) {
//       try {
//         const paymentSuccess = Math.random() > 0.2;
//
//         if (paymentSuccess) {
//           await prisma.backer.update({
//             where: { id: backer.id },
//             data: {
//               paymentStatus: "captured",
//               capturedAt: new Date(),
//             },
//           });
//           results.success.push(backer);
//         } else {
//           await prisma.backer.update({
//             where: { id: backer.id },
//             data: {
//               paymentStatus: "failed",
//               errorMessage: "Payment processing failed (simulated)",
//             },
//           });
//           results.failed.push(backer);
//         }
//       } catch (error) {
//         console.error(`Error processing backer ${backer.id}:`, error);
//         results.failed.push(backer);
//       }
//     }
//
//     return new Response(JSON.stringify({ results }), {
//       status: 200,
//       headers: {
//         "Content-Type": "application/json",
//       },
//     });
//   } catch (error) {
//     console.error("Error in capture-payments:", error);
//     return new Response(JSON.stringify({ error: error.message }), {
//       status: 500,
//       headers: {
//         "Content-Type": "application/json",
//       },
//     });
//   }
// }

export default function CampaignDetailsPage() {
  const { campaign, pendingBackers, capturedBackers, failedBackers, stats } =
    useLoaderData();
  const navigate = useNavigate();
  // const [processing, setProcessing] = useState(false);
  // const [showResults, setShowResults] = useState(false);
  // const [results, setResults] = useState(null);

  useEffect(() => {
    console.log("🔥🔥🔥 CAMPAIGN DETAILS PAGE LOADED 🔥🔥🔥");
    console.log("Campaign:", campaign);
    console.log("Stats:", stats);
  }, [campaign, stats]);

  // Manual capture function commented out (auto-capture active)
  // const handleCapturePayments = async () => {
  //   if (
  //     !confirm(
  //       `Process ${stats.pendingCount} payments totaling $${stats.totalPending.toFixed(2)}?`,
  //     )
  //   ) {
  //     return;
  //   }
  //   setProcessing(true);
  //   try {
  //     const formData = new FormData();
  //     formData.append("action", "capture-payments");
  //     const response = await fetch(`/app/campaigns/${campaign.id}`, {
  //       method: "POST",
  //       body: formData,
  //     });
  //     // ... rest of manual capture logic
  //   } catch (error) {
  //     console.error("Capture error:", error);
  //     alert(`Error: ${error.message}`);
  //   } finally {
  //     setProcessing(false);
  //   }
  // };

  // eslint-disable-next-line react/prop-types
  const StatCard = ({ label, value, subvalue, bgColor = "#f8f9fa", color = "#333" }) => (
    <div style={{ background: bgColor, padding: "20px", borderRadius: "8px" }}>
      <div style={{ fontSize: "14px", color }}>{label}</div>
      <div style={{ fontSize: "32px", fontWeight: "bold", color }}>{value}</div>
      {subvalue && <div style={{ fontSize: "12px", color }}>{subvalue}</div>}
    </div>
  );

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header with back button */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
        <button
          onClick={() => navigate("/app/dashboard")}
          style={{
            background: "none",
            border: "none",
            fontSize: "24px",
            cursor: "pointer",
            marginRight: "15px",
          }}
        >
          ←
        </button>
        <div>
          <h1 style={{ margin: 0 }}>{campaign.campaignTitle}</h1>
          <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
            <span
              style={{
                padding: "2px 8px",
                background: campaign.status === "ended" ? "#dc3545" : "#28a745",
                color: "white",
                borderRadius: "12px",
                fontSize: "12px",
              }}
            >
              {campaign.status.toUpperCase()}
            </span>
            <span style={{ color: "#666", fontSize: "14px" }}>
              Product: {campaign.productTitle}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "20px",
          marginBottom: "30px",
        }}
      >
        <StatCard label="Total Backers" value={stats.totalBackers} />
        <StatCard
          label="Total Raised"
          value={`$${stats.totalRaised.toFixed(2)}`}
        />
        <StatCard
          label="Pending"
          value={`$${stats.totalPending.toFixed(2)}`}
          subvalue={`${stats.pendingCount} payments`}
          bgColor="#fff3cd"
          color="#856404"
        />
        <StatCard
          label="Captured"
          value={`$${stats.totalCaptured.toFixed(2)}`}
          subvalue={`${stats.capturedCount} payments`}
          bgColor="#d4edda"
          color="#155724"
        />
      </div>

      {/* 
        =============================================
        MANUAL CAPTURE BUTTON - COMMENTED OUT
        Auto-capture is now handled by webhook + autoCapture.js
        =============================================
      */}
      {/* {campaign.status === "ended" && stats.pendingCount > 0 && (
        <div style={{ marginBottom: "30px" }}>
          <button
            onClick={handleCapturePayments}
            disabled={processing}
            style={{
              width: "100%",
              padding: "15px",
              background: processing ? "#6c757d" : "#28a745",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: "bold",
              cursor: processing ? "not-allowed" : "pointer",
            }}
          >
            {processing
              ? "Processing..."
              : `💰 Capture ${stats.pendingCount} Pending Payments ($${stats.totalPending.toFixed(2)})`}
          </button>
        </div>
      )} */}

      {/* Results Modal (commented out) */}
      {/* {showResults && results && (
        <ResultsModal
          results={results}
          onClose={() => {
            setShowResults(false);
            window.location.reload();
          }}
        />
      )} */}

      {/* Backers Tables */}
      {capturedBackers.length > 0 && (
        <BackersTable
          title="✅ Captured Payments"
          backers={capturedBackers}
          color="#28a745"
          showCapturedDate={true}
        />
      )}

      {failedBackers.length > 0 && (
        <BackersTable
          title="❌ Failed Payments"
          backers={failedBackers}
          color="#dc3545"
          showError={true}
        />
      )}

      {pendingBackers.length > 0 && (
        <BackersTable
          title="⏳ Pending Payments (Authorized)"
          backers={pendingBackers}
          color="#ffc107"
        />
      )}
    </div>
  );
}

// Backers Table Component (same as before, no changes)
// eslint-disable-next-line react/prop-types
function BackersTable({ title, backers, color, showCapturedDate, showError }) {
  return (
    <div style={{ marginBottom: "30px" }}>
      <h2 style={{ color, marginBottom: "15px" }}>
        
        {title} ({backers.length}) 
      </h2>
      <div
        style={{
          background: "white",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dee2e6" }}>
              <th style={{ padding: "12px", textAlign: "left" }}>Customer</th>
              <th style={{ padding: "12px", textAlign: "left" }}>Email</th>
              <th style={{ padding: "12px", textAlign: "left" }}>Amount</th>
              {showCapturedDate && <th style={{ padding: "12px", textAlign: "left" }}>Captured</th>}
              {showError && <th style={{ padding: "12px", textAlign: "left" }}>Error</th>}
              <th style={{ padding: "12px", textAlign: "left" }}>Order</th>
            </tr>
          </thead>
          <tbody>
            {backers.map((backer) => (
              <tr key={backer.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                <td style={{ padding: "12px" }}>{backer.customerName || "Anonymous"}</td>
                <td style={{ padding: "12px" }}>{backer.customerEmail || "—"}</td>
                <td style={{ padding: "12px", fontWeight: "bold" }}>
                  ${backer.totalAmount.toFixed(2)}
                </td>
                {showCapturedDate && (
                  <td style={{ padding: "12px" }}>
                    {backer.capturedAt
                      ? new Date(backer.capturedAt).toLocaleDateString()
                      : "—"}
                  </td>
                )}
                {showError && (
                  <td style={{ padding: "12px", color: "#dc3545" }}>
                    {backer.errorMessage || "Unknown error"}
                  </td>
                )}
                <td style={{ padding: "12px" }}>
                  <a
                    href={`https://admin.shopify.com/orders/${backer.orderId.split("/").pop()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#008060", textDecoration: "none" }}
                  >
                    View Order →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ResultsModal component (commented out or keep but not used)
// function ResultsModal({ results, onClose }) { ... }