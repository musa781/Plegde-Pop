import { useLoaderData, Link, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Loader - Fetch campaigns
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const campaigns = await prisma.campaign.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  // Calculate stats for top cards
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const totalPledged = campaigns.reduce(
    (sum, c) => sum + (c.raisedAmount || 0),
    0,
  );

  // Calculate average progress
  const campaignsWithProgress = campaigns.filter(
    (c) => c.targetUnits && c.targetUnits > 0,
  );
  const avgProgress =
    campaignsWithProgress.length > 0
      ? (
          campaignsWithProgress.reduce((sum, c) => {
            const progress =
              ((c.raisedAmount || 0) /
                (c.basePledge || 1) /
                (c.targetUnits || 1)) *
              100;
            return sum + progress;
          }, 0) / campaignsWithProgress.length
        ).toFixed(0)
      : 0;

  return {
    campaigns,
    stats: { totalCampaigns, activeCampaigns, totalPledged, avgProgress },
  };
}

// Helper for status badge
const getStatusBadge = (status) => {
  const styles = {
    active: { background: "#d4edda", color: "#155724", text: "Active" },
    ended: { background: "#f8d7da", color: "#721c24", text: "Ended" },
    draft: { background: "#fff3cd", color: "#856404", text: "Draft" },
  };
  return styles[status] || styles.draft;
};

// Helper for type badge
const getTypeBadge = (mode) => {
  return mode === "pledge"
    ? { background: "#fff3cd", color: "#856404", text: "Pledge" }
    : { background: "#cce5ff", color: "#004085", text: "Full Price" };
};

// Main Component
export default function DashboardPage() {
  const { campaigns, stats } = useLoaderData();
  const navigate = useNavigate();

  // Format date range
  const formatDateRange = (campaign) => {
    if (!campaign.startDate) return "Not scheduled";
    const start = new Date(campaign.startDate);
    const end = new Date(campaign.endDate || campaign.startDate);
    const options = { month: "short", day: "numeric" };
    return `${start.toLocaleDateString("en-US", options)} - ${end.toLocaleDateString("en-US", options)}`;
  };

  return (
    <div style={{ padding: "20px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "30px",
        }}
      >
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <Link to="/app/campaigns">
          <button
            style={{
              padding: "10px 20px",
              background: "#008060",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            + New Campaign
          </button>
        </Link>
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
        <div
          style={{
            background: "#667eea",
            padding: "20px",
            borderRadius: "10px",
            color: "white",
          }}
        >
          <div style={{ fontSize: "14px", opacity: 0.9 }}>Total Campaigns</div>
          <div style={{ fontSize: "36px", fontWeight: "bold" }}>
            {stats.totalCampaigns}
          </div>
        </div>
        <div
          style={{
            background: "#f093fb",
            padding: "20px",
            borderRadius: "10px",
            color: "white",
          }}
        >
          <div style={{ fontSize: "14px", opacity: 0.9 }}>Active Campaigns</div>
          <div style={{ fontSize: "36px", fontWeight: "bold" }}>
            {stats.activeCampaigns}
          </div>
        </div>
        <div
          style={{
            background: "#43e97b",
            padding: "20px",
            borderRadius: "10px",
            color: "white",
          }}
        >
          <div style={{ fontSize: "14px", opacity: 0.9 }}>Total Pledged</div>
          <div style={{ fontSize: "36px", fontWeight: "bold" }}>
            ${stats.totalPledged}
          </div>
        </div>
        <div
          style={{
            background: "#fa709a",
            padding: "20px",
            borderRadius: "10px",
            color: "white",
          }}
        >
          <div style={{ fontSize: "14px", opacity: 0.9 }}>
            Avg. Campaign Progress
          </div>
          <div style={{ fontSize: "36px", fontWeight: "bold" }}>
            {stats.avgProgress}%
          </div>
        </div>
      </div>

      {/* Campaigns Table */}
      <div
        style={{
          background: "white",
          borderRadius: "10px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#2c3e50", color: "white" }}>
              <th style={{ padding: "15px", textAlign: "left" }}>Campaign</th>
              <th style={{ padding: "15px", textAlign: "left" }}>Status</th>
              <th style={{ padding: "15px", textAlign: "left" }}>Type</th>
              <th style={{ padding: "15px", textAlign: "left" }}>Dates</th>
              <th style={{ padding: "15px", textAlign: "left" }}>Backers</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  style={{
                    padding: "40px",
                    textAlign: "center",
                    color: "#666",
                  }}
                >
                  No campaigns yet.{" "}
                  <Link to="/app/campaigns">Create your first campaign!</Link>
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => {
                const statusBadge = getStatusBadge(campaign.status);
                const typeBadge = getTypeBadge(campaign.campaignMode);

                return (
                  <tr
                    key={campaign.id}
                    style={{
                      borderBottom: "1px solid #ecf0f1",
                      cursor: "pointer",
                    }}
                    onClick={() => navigate(`/app/campaigns/${campaign.id}`)}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#f8f9fa")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "white")
                    }
                  >
                    {/* Campaign column with image */}
                    <td style={{ padding: "15px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        {campaign.productImage ? (
                          <img
                            src={campaign.productImage}
                            alt={campaign.productTitle}
                            style={{
                              width: "40px",
                              height: "40px",
                              objectFit: "cover",
                              borderRadius: "4px",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "40px",
                              height: "40px",
                              background: "#e9ecef",
                              borderRadius: "4px",
                            }}
                          />
                        )}
                        <div>
                          <div style={{ fontWeight: "bold" }}>
                            {campaign.campaignTitle || campaign.productTitle}
                          </div>
                          <div style={{ fontSize: "12px", color: "#666" }}>
                            {campaign.productTitle}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: "15px" }}>
                      <span
                        style={{
                          background: statusBadge.background,
                          color: statusBadge.color,
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "bold",
                        }}
                      >
                        {statusBadge.text}
                      </span>
                    </td>

                    {/* Type */}
                    <td style={{ padding: "15px" }}>
                      <span
                        style={{
                          background: typeBadge.background,
                          color: typeBadge.color,
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "bold",
                        }}
                      >
                        {typeBadge.text}
                      </span>
                    </td>

                    {/* Dates */}
                    <td style={{ padding: "15px", fontSize: "14px" }}>
                      {formatDateRange(campaign)}
                    </td>

                    {/* Backers */}
                    <td
                      style={{
                        padding: "15px",
                        fontWeight: "bold",
                        fontSize: "16px",
                      }}
                    >
                      {campaign.backersCount || 0}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
