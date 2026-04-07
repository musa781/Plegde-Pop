import { useState, useEffect } from "react";
import { useLoaderData, Form, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import PropTypes from "prop-types";

// Loader - Fetch products from Shopify with handles
export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(
    `
    query {
      products(first: 20) {
        edges {
          node {
            id
            title
            handle
            featuredImage {
              url
            }
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
          }
        }
      }
    }
  `,
  );

  const productsData = await response.json();

  if (productsData.errors) {
    console.error("GraphQL Errors:", productsData.errors);
    return {
      products: [],
      shop: session.shop,
      error: "Failed to fetch products",
    };
  }

  const products =
    productsData.data?.products?.edges?.map(({ node }) => ({
      id: node.id,
      title: node.title,
      handle: node.handle,
      image: node.featuredImage?.url || null,
      price: node.variants?.edges[0]?.node?.price || "0.00",
    })) || [];

  return {
    products,
    shop: session.shop,
  };
}

// Action - Create new campaign
export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  // Get all form fields
  const productId = formData.get("productId");
  const productTitle = formData.get("productTitle");
  const productImage = formData.get("productImage");
  const originalPrice = formData.get("originalPrice");
  const campaignMode = formData.get("campaignMode");
  const campaignTitle = formData.get("campaignTitle");
  const basePledge = parseFloat(formData.get("basePledge")) || 2.0;
  const targetUnits = parseInt(formData.get("targetUnits")) || 100;
  const manualUnits = parseInt(formData.get("manualUnits")) || 0;
  const startDate = formData.get("startDate")
    ? new Date(formData.get("startDate"))
    : null;
  const endDate = formData.get("endDate")
    ? new Date(formData.get("endDate"))
    : null;
  const startTime = formData.get("startTime");
  const endTime = formData.get("endTime");
  const timezone = formData.get("timezone") || "America/New_York";

  // Calculate status
  let status = "draft";
  const now = new Date();
  if (startDate && endDate) {
    if (now >= startDate && now <= endDate) {
      status = "active";
    } else if (now > endDate) {
      status = "ended";
    }
  }

  // Save to database
  let campaign;
  try {
    campaign = await prisma.campaign.create({
      data: {
        productId,
        productTitle,
        productImage,
        originalPrice,
        campaignMode,
        shop: session.shop,
        campaignTitle,
        basePledge,
        targetUnits,
        manualUnits,
        startDate,
        endDate,
        startTime,
        endTime,
        timezone,
        status,
        backersCount: 0,
        raisedAmount: 0,
      },
    });

    console.log("Campaign saved:", campaign);
  } catch (dbError) {
    console.error("Database error:", dbError);
    return { error: "Failed to save campaign" };
  }

  // =============================================
  // SAVE MILESTONES TO DATABASE
  // =============================================
  const milestonesJson = formData.get("milestones");
  let savedMilestones = [];

  if (milestonesJson) {
    try {
      const milestones = JSON.parse(milestonesJson);
      console.log("Milestones to save:", milestones);

      for (const milestone of milestones) {
        console.log("Saving milestone with imageUrl:", milestone.imageUrl);

        const saved = await prisma.milestone.create({
          data: {
            campaignId: campaign.id,
            amount: parseFloat(milestone.amount) || 0,
            title: milestone.title || "Milestone",
            description: milestone.description || "",
            imageUrl: milestone.imageUrl || campaign.productImage || null,
            isReached: false,
          },
        });
        console.log(
          "Saving milestone with image:",
          milestone.imageUrl || campaign.productImage,
        );
        savedMilestones.push(saved);
      }

      console.log(`Saved ${savedMilestones.length} milestones`);
    } catch (error) {
      console.error("Error saving milestones:", error);
    }
  }

  // =============================================
  // SAVE ADDONS TO DATABASE
  // =============================================
  const addonsJson = formData.get("addons");

  if (addonsJson) {
    try {
      const addons = JSON.parse(addonsJson);
      console.log("Addons to save:", addons);

      for (const addon of addons) {
        if (addon.name && addon.name.trim() !== "" && addon.price > 0) {
          await prisma.addon.create({
            data: {
              campaignId: campaign.id,
              name: addon.name,
              price: parseFloat(addon.price) || 0,
              description: addon.description || null,
              imageUrl: productImage || null,
            },
          });
        }
      }
      console.log(`Saved addons for campaign ${campaign.id}`);
    } catch (error) {
      console.error("Error saving addons:", error);
    }
  }

  // =============================================
  // 🆕 CREATE SELLING PLANS FOR THE CAMPAIGN
  // =============================================

  if (campaignMode === "pledge") {
    try {
      console.log("Creating selling plans for campaign:", campaign.id);

      // 1. Updated Mutation to include $resources
      const sellingPlanResponse = await admin.graphql(
        `mutation CreateSellingPlanGroup($input: SellingPlanGroupInput!, $resources: SellingPlanGroupResourceInput) {
        sellingPlanGroupCreate(input: $input, resources: $resources) {
          sellingPlanGroup {
            id
            name
            sellingPlans(first: 5) {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
        {
          variables: {
            input: {
              name: campaignTitle || "Pledge Campaign",
              merchantCode: `campaign-${campaign.id}`,
              // productIds: [productId], // REMOVE FROM HERE
              options: ["Pledge Option"], // Required field: represents the dropdown label
              sellingPlansToCreate: [
                {
                  name: `Pledge $${basePledge}`,
                  options: ["Pledge"], // Required field: matching the group option
                  category: "SUBSCRIPTION", // Recommended for proper rendering
                  billingPolicy: {
                    recurring: {
                      interval: "MONTH",
                      intervalCount: 1,
                    },
                  },
                  deliveryPolicy: {
                    recurring: {
                      interval: "MONTH",
                      intervalCount: 1,
                    },
                  },
                  pricingPolicies: [
                    {
                      fixed: {
                        adjustmentType: "PERCENTAGE",
                        adjustmentValue: {
                          percentage: 0,
                        },
                      },
                    },
                  ],
                },
              ],
            },
            // 2. MOVE productIds HERE
            resources: {
              productIds: [productId],
            },
          },
        },
      );

      const planData = await sellingPlanResponse.json();

      // Check for errors
      if (
        planData.errors ||
        planData.data?.sellingPlanGroupCreate?.userErrors?.length > 0
      ) {
        const errors =
          planData.errors || planData.data.sellingPlanGroupCreate.userErrors;
        console.error(
          "Selling plan creation errors:",
          JSON.stringify(errors, null, 2),
        );
      } else {
        const planGroup = planData.data.sellingPlanGroupCreate.sellingPlanGroup;
        console.log("✅ Selling plan group created:", planGroup.id);

        // Extract plan IDs
        const plans = planGroup.sellingPlans.edges.map((e) => ({
          id: e.node.id,
          name: e.node.name,
        }));

        console.log("✅ Plans created:", plans);

        // Save selling plan info to database
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            sellingPlanGroupId: planGroup.id,
            sellingPlanIds: JSON.stringify(plans),
            preOrderType: "deposit",
          },
        });

        console.log("✅ Selling plan info saved to database");
      }
    } catch (error) {
      console.error("❌ Error creating selling plans:", error);
      // Don't fail the campaign creation if selling plan creation fails
    }
  }

  // =============================================
  // SET METAFIELD WITH CAMPAIGN DATA
  // =============================================
  try {
    // Get fresh campaign data with milestones and addons
    const campaignWithData = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      include: { milestones: true, addons: true },
    });

    // Prepare campaign data for metafield
    const metafieldValue = {
      id: campaign.id,
      campaignMode: campaignWithData.campaignMode,
      campaignTitle: campaignWithData.campaignTitle,
      basePledge: campaignWithData.basePledge,
      targetUnits: campaignWithData.targetUnits,
      backersCount: campaignWithData.backersCount || 0,
      raisedAmount: campaignWithData.raisedAmount || 0,
      status: campaignWithData.status,
      endDate: campaignWithData.endDate,
      productTitle: campaignWithData.productTitle,
      originalPrice: campaignWithData.originalPrice,
      productImage: campaignWithData.productImage,

      // 🆕 Add selling plan info to metafield
      sellingPlanGroupId: campaignWithData.sellingPlanGroupId,
      sellingPlanIds: campaignWithData.sellingPlanIds
        ? JSON.parse(campaignWithData.sellingPlanIds)
        : [],
      preOrderType: campaignWithData.preOrderType,

      // Milestones with images
      milestones: campaignWithData.milestones.map((m) => ({
        amount: m.amount,
        title: m.title,
        description: m.description,
        imageUrl: m.imageUrl,
        isReached: m.isReached,
      })),

      // Addons for the modal
      addons: campaignWithData.addons.map((a) => ({
        name: a.name,
        price: a.price,
        description: a.description,
        imageUrl: a.imageUrl,
      })),
    };

    console.log(
      "Metafield value with selling plans:",
      JSON.stringify(metafieldValue, null, 2),
    );

    const jsonString = JSON.stringify(metafieldValue);

    const metafieldResponse = await admin.graphql(
      `mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              ownerId: productId,
              namespace: "pledgepop",
              key: "campaign",
              value: jsonString,
              type: "json",
            },
          ],
        },
      },
    );

    const result = await metafieldResponse.json();
    console.log("Metafield result:", JSON.stringify(result, null, 2));

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      console.error("Metafield errors:", result.data.metafieldsSet.userErrors);
    }
  } catch (error) {
    console.error("Metafield error:", error);
  }

  return { success: true };
}

// Preview Widget Component with PropTypes
function CampaignPreview({ formData, selectedProduct, shop }) {
  const [previewData, setPreviewData] = useState({
    campaignTitle: "New campaign Testing",
    campaignMode: "pledge",
    basePledge: 2,
    targetUnits: 100,
    product: null,
    daysLeft: 30,
    backers: 0,
    raised: 0,
  });

  // Use shop from props directly
  const shopDomain = shop;

  // Get product URL from handle
  const getProductUrl = (product) => {
    if (!product || !shopDomain) return null;

    if (product.handle) {
      return `https://${shopDomain}/products/${product.handle}`;
    }

    const matches = product.id?.match(/\/(\d+)$/);
    const numericId = matches ? matches[1] : null;
    return numericId ? `https://${shopDomain}/products/${numericId}` : null;
  };

  // Update preview when form data changes
  useEffect(() => {
    let daysLeft = 30;
    if (formData.endDate) {
      const end = new Date(formData.endDate);
      const today = new Date();
      const diffTime = end - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      daysLeft = diffDays > 0 ? diffDays : 0;
    }

    setPreviewData({
      campaignTitle: formData.campaignTitle || "New campaign Testing",
      campaignMode: formData.campaignMode || "pledge",
      basePledge: parseFloat(formData.basePledge) || 2,
      targetUnits: parseInt(formData.targetUnits) || 100,
      product: selectedProduct,
      daysLeft: daysLeft,
      backers: Math.floor(Math.random() * 50) + 5,
      raised:
        (Math.floor(Math.random() * 30) + 10) *
        (parseFloat(formData.basePledge) || 2),
    });
  }, [formData, selectedProduct]);

  const progressPercent = Math.min(
    (previewData.raised / previewData.basePledge / previewData.targetUnits) *
      100,
    100,
  );

  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        overflow: "hidden",
        position: "sticky",
        top: "20px",
      }}
    >
      {/* Preview Header */}
      <div
        style={{
          background: "#2c3e50",
          color: "white",
          padding: "15px 20px",
          fontWeight: "bold",
          fontSize: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>👁️ Widget Preview</span>
        <span
          style={{
            background: "rgba(255,255,255,0.2)",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "12px",
          }}
        >
          Live Preview
        </span>
      </div>

      {/* Preview Content */}
      <div style={{ padding: "20px" }}>
        {previewData.product ? (
          <>
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "200px",
                background: "#f8f9fa",
                borderRadius: "8px",
                overflow: "hidden",
                marginBottom: "15px",
              }}
            >
              {previewData.product.image ? (
                <img
                  src={previewData.product.image}
                  alt={previewData.product.title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#e9ecef",
                    color: "#6c757d",
                  }}
                >
                  No product image
                </div>
              )}

              <div
                style={{
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  background:
                    previewData.campaignMode === "pledge"
                      ? "#f39c12"
                      : "#3498db",
                  color: "white",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "bold",
                }}
              >
                {previewData.campaignMode === "pledge"
                  ? "💰 Pledge Mode"
                  : "🏷️ Full Price"}
              </div>
            </div>

            <h3 style={{ margin: "0 0 10px 0", fontSize: "18px" }}>
              {previewData.campaignTitle}
            </h3>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "15px",
                padding: "10px",
                background: "#f8f9fa",
                borderRadius: "8px",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", color: "#6c757d" }}>
                  Original Price
                </div>
                <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                  ${previewData.product.price}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "#6c757d" }}>
                  Pledge Amount
                </div>
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: "bold",
                    color: "#28a745",
                  }}
                >
                  ${previewData.basePledge}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "15px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "5px",
                  fontSize: "14px",
                }}
              >
                <span>Progress</span>
                <span style={{ fontWeight: "bold" }}>
                  {previewData.backers} backers • ${previewData.raised} raised
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  background: "#e9ecef",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: "100%",
                    background: progressPercent >= 100 ? "#28a745" : "#007bff",
                    borderRadius: "4px",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "5px",
                  fontSize: "12px",
                  color: "#6c757d",
                }}
              >
                <span>Target: {previewData.targetUnits} units</span>
                <span>{progressPercent.toFixed(0)}%</span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px",
                background: previewData.daysLeft > 0 ? "#e3f2fd" : "#f8d7da",
                borderRadius: "8px",
                color: previewData.daysLeft > 0 ? "#0d6efd" : "#721c24",
                marginBottom: "15px",
              }}
            >
              <span style={{ fontSize: "20px" }}>
                {previewData.daysLeft > 0 ? "⏰" : "⏳"}
              </span>
              <div>
                <div style={{ fontSize: "12px", opacity: 0.8 }}>
                  {previewData.daysLeft > 0
                    ? "Time Remaining"
                    : "Campaign Ended"}
                </div>
                <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                  {previewData.daysLeft > 0
                    ? `${previewData.daysLeft} days left`
                    : "Ended"}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
              {/* View Campaign Button */}
              {shopDomain &&
              previewData.product &&
              getProductUrl(previewData.product) ? (
                <a
                  href={getProductUrl(previewData.product)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    padding: "12px",
                    background: "#6c757d",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "bold",
                    textDecoration: "none",
                    textAlign: "center",
                    cursor: "pointer",
                    display: "inline-block",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => (e.target.style.background = "#5a6268")}
                  onMouseLeave={(e) => (e.target.style.background = "#6c757d")}
                >
                  👁️ View Campaign
                </a>
              ) : (
                <button
                  onClick={() => {
                    alert(
                      `Cannot create link. Product information incomplete.`,
                    );
                  }}
                  style={{
                    flex: 1,
                    padding: "12px",
                    background: "#6c757d",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    opacity: 0.7,
                  }}
                >
                  👁️ View Campaign (Unavailable)
                </button>
              )}

              {/* Preview CTA Button */}
              <button
                style={{
                  flex: 1,
                  padding: "12px",
                  background:
                    previewData.campaignMode === "pledge"
                      ? "#f39c12"
                      : "#3498db",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  transition: "opacity 0.2s",
                }}
              >
                {previewData.campaignMode === "pledge"
                  ? `Pledge $${previewData.basePledge}`
                  : "Buy Now"}
              </button>
            </div>

            <p
              style={{
                fontSize: "11px",
                color: "#6c757d",
                textAlign: "center",
                marginTop: "10px",
                marginBottom: 0,
              }}
            >
              ⚡ Click &quot;View Campaign&quot; to see it on your store
            </p>
          </>
        ) : (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "#6c757d",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "10px" }}>👈</div>
            <p>Select a product to see live preview</p>
          </div>
        )}
      </div>
    </div>
  );
}

CampaignPreview.propTypes = {
  formData: PropTypes.object,
  selectedProduct: PropTypes.object,
  shop: PropTypes.string.isRequired,
};

// Main Component
export default function CampaignsPage() {
  const { products, shop } = useLoaderData();
  const navigate = useNavigate();
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [campaignMode, setCampaignMode] = useState("pledge");
  const [formData, setFormData] = useState({});
  const [milestones, setMilestones] = useState([]);
  const [enableMilestones, setEnableMilestones] = useState(false);
  const [addons, setAddons] = useState([]);
  const [enableAddons, setEnableAddons] = useState(false);

  // Add a new milestone with product image
  const addMilestone = () => {
    const newMilestone = {
      id: Date.now(), // temporary ID for React
      amount: 0,
      title: "",
      description: "",
      imageUrl: selectedProduct?.image || null, // Auto-add product image
    };
    console.log("Adding new milestone with image:", newMilestone.imageUrl); // Debug log

    setMilestones([...milestones, newMilestone]);
  };

  // Update a milestone
  const updateMilestone = (id, field, value) => {
    const updatedMilestones = milestones.map((m) =>
      m.id === id ? { ...m, [field]: value } : m,
    );
    setMilestones(updatedMilestones);
  };

  // Remove a milestone
  const removeMilestone = (id) => {
    setMilestones(milestones.filter((m) => m.id !== id));
  };

  // Add Addon Management Functions

  // Add a new addon
  const addAddon = () => {
    const newAddon = {
      id: Date.now(), // temporary ID for React
      name: "",
      price: 0,
      description: "",
      imageUrl: null,
    };
    setAddons([...addons, newAddon]);
  };

  // Update an addon
  const updateAddon = (id, field, value) => {
    const updatedAddons = addons.map((a) =>
      a.id === id ? { ...a, [field]: value } : a,
    );
    setAddons(updatedAddons);
  };

  // Remove an addon
  const removeAddon = (id) => {
    setAddons(addons.filter((a) => a.id !== id));
  };

  // Auto-calculate end date (30 days from start)
  const handleStartDateChange = (e) => {
    const startDate = new Date(e.target.value);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);

    const endDateInput = document.getElementById("endDate");
    if (endDateInput) {
      endDateInput.value = endDate.toISOString().split("T")[0];
    }

    setFormData((prev) => ({
      ...prev,
      startDate: e.target.value,
      endDate: endDate.toISOString().split("T")[0],
    }));
  };

  // Handle product selection
  const handleProductSelect = (e) => {
    const product = products.find((p) => p.id === e.target.value);
    setSelectedProduct(product);

    // Update form data
    setFormData((prev) => ({ ...prev, product }));

    // Update all existing milestones with this product image
    if (milestones.length > 0) {
      setMilestones((prevMilestones) =>
        prevMilestones.map((milestone) => ({
          ...milestone,
          imageUrl: product?.image || null, // Add product image to each milestone
        })),
      );
    }

    // 🆕 Update addons (optional - could set default image later)
    // No automatic update needed for addons yet
  };

  // Handle form field changes for preview
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    let parsedValue = value;
    if (
      name === "basePledge" ||
      name === "targetUnits" ||
      name === "manualUnits"
    ) {
      parsedValue = parseFloat(value) || 0;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: parsedValue,
    }));
  };

  return (
    <div
      style={{
        padding: "20px",
        display: "grid",
        gridTemplateColumns: "1fr 350px",
        gap: "20px",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      {/* Left Column - Form */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "30px",
          }}
        >
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
          <h1 style={{ margin: 0 }}>Create New Campaign</h1>
        </div>

        <Form method="post" onChange={handleInputChange}>
          {/* SECTION 1: Campaign Details */}
          <div
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              marginBottom: "20px",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "20px" }}>
              Campaign Details
            </h2>

            <div style={{ marginBottom: "20px" }}>
              <h4
                style={{
                  display: "block",
                  marginBottom: "5px",
                  fontWeight: "bold",
                }}
              >
                Campaign Title <span style={{ color: "red" }}>*</span>
              </h4>
              <input
                type="text"
                name="campaignTitle"
                required
                placeholder="New campaign Testing"
                defaultValue="New campaign Testing"
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <h4
                style={{
                  display: "block",
                  marginBottom: "5px",
                  fontWeight: "bold",
                }}
              >
                Product <span style={{ color: "red" }}>*</span>
              </h4>
              <select
                name="productId"
                required
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
                onChange={handleProductSelect}
              >
                <option value="">Select a product...</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title} - ${product.price}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
                Choose the primary product for this campaign
              </p>

              {selectedProduct && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "15px",
                    marginTop: "15px",
                    padding: "15px",
                    background: "#f8f9fa",
                    borderRadius: "8px",
                    border: "1px solid #e9ecef",
                  }}
                >
                  {selectedProduct.image ? (
                    <img
                      src={selectedProduct.image}
                      alt={selectedProduct.title}
                      style={{
                        width: "60px",
                        height: "60px",
                        objectFit: "cover",
                        borderRadius: "8px",
                        border: "1px solid #dee2e6",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "60px",
                        height: "60px",
                        background: "#e9ecef",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10px",
                        color: "#6c757d",
                        border: "1px solid #dee2e6",
                      }}
                    >
                      No Image
                    </div>
                  )}

                  <div>
                    <div
                      style={{
                        fontWeight: "bold",
                        fontSize: "16px",
                        marginBottom: "4px",
                      }}
                    >
                      {selectedProduct.title}
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        color: "#28a745",
                        fontWeight: "bold",
                      }}
                    >
                      ${selectedProduct.price}
                    </div>
                  </div>
                </div>
              )}

              {selectedProduct && (
                <>
                  <input
                    type="hidden"
                    name="productTitle"
                    value={selectedProduct.title}
                  />
                  <input
                    type="hidden"
                    name="productImage"
                    value={selectedProduct.image || ""}
                  />
                  <input
                    type="hidden"
                    name="originalPrice"
                    value={selectedProduct.price}
                  />
                  <input
                    type="hidden"
                    name="productHandle"
                    value={selectedProduct.handle || ""}
                  />
                </>
              )}
            </div>
          </div>

          {/* SECTION 2: Campaign Mode */}
          <div
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              marginBottom: "20px",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "20px" }}>
              Campaign Mode
            </h2>

            <div style={{ display: "flex", gap: "20px" }}>
              <label
                style={{ display: "flex", alignItems: "center", gap: "5px" }}
              >
                <input
                  type="radio"
                  name="campaignMode"
                  value="pledge"
                  checked={campaignMode === "pledge"}
                  onChange={(e) => {
                    setCampaignMode(e.target.value);
                    setFormData((prev) => ({
                      ...prev,
                      campaignMode: e.target.value,
                    }));
                  }}
                />
                Pledge Mode
              </label>
              <label
                style={{ display: "flex", alignItems: "center", gap: "5px" }}
              >
                <input
                  type="radio"
                  name="campaignMode"
                  value="full_price"
                  checked={campaignMode === "full_price"}
                  onChange={(e) => {
                    setCampaignMode(e.target.value);
                    setFormData((prev) => ({
                      ...prev,
                      campaignMode: e.target.value,
                    }));
                  }}
                />
                Full Price Mode
              </label>
            </div>
          </div>

          {/* SECTION 3: Campaign Goals */}
          <div
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              marginBottom: "20px",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "10px" }}>
              Campaign Goals
            </h2>
            <p style={{ fontSize: "14px", color: "#666", marginBottom: "5px" }}>
              Set your pledge deposit and backer target
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "20px",
                marginBottom: "20px",
              }}
            >
              <div>
                <h4
                  style={{
                    display: "block",
                    marginBottom: "5px",
                    fontWeight: "bold",
                  }}
                >
                  Base pledge deposit
                </h4>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span
                    style={{
                      background: "#f5f5f5",
                      padding: "10px",
                      border: "1px solid #ddd",
                      borderRight: "none",
                      borderRadius: "4px 0 0 4px",
                    }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    name="basePledge"
                    defaultValue="2"
                    step="0.01"
                    min="0"
                    onChange={handleInputChange}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "0 4px 4px 0",
                      border: "1px solid #ddd",
                      borderLeft: "none",
                    }}
                  />
                </div>
              </div>

              <div>
                <h4
                  style={{
                    display: "block",
                    marginBottom: "5px",
                    fontWeight: "bold",
                  }}
                >
                  Target number of units sold
                </h4>
                <input
                  type="number"
                  name="targetUnits"
                  defaultValue="100"
                  min="1"
                  onChange={handleInputChange}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "4px",
                    border: "1px solid #ddd",
                  }}
                />
              </div>
            </div>

            <div>
              <h4
                style={{
                  display: "block",
                  marginBottom: "5px",
                  fontWeight: "bold",
                }}
              >
                Add Manual Units (Optional)
              </h4>
              <input
                type="number"
                name="manualUnits"
                defaultValue="0"
                min="0"
                onChange={handleInputChange}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              />
            </div>
          </div>

          {/* SECTION 4: Schedule */}
          <div
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              marginBottom: "20px",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "20px" }}>Schedule</h2>

            <div
              style={{
                background: "#f0f7ff",
                padding: "15px",
                borderRadius: "4px",
                marginBottom: "20px",
                border: "1px solid #cce5ff",
              }}
            >
              <strong>Campaign Duration:</strong> 30 days 0 hours • Shop
              Timezone: America/New_York
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "20px",
              }}
            >
              <div>
                <h4
                  style={{
                    display: "block",
                    marginBottom: "5px",
                    fontWeight: "bold",
                  }}
                >
                  Start Date
                </h4>
                <input
                  type="date"
                  name="startDate"
                  id="startDate"
                  required
                  defaultValue="2026-02-05"
                  onChange={handleStartDateChange}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "4px",
                    border: "1px solid #ddd",
                  }}
                />
              </div>

              <div>
                <h4
                  style={{
                    display: "block",
                    marginBottom: "5px",
                    fontWeight: "bold",
                  }}
                >
                  End Date
                </h4>
                <input
                  type="date"
                  name="endDate"
                  id="endDate"
                  required
                  defaultValue="2026-03-07"
                  onChange={handleInputChange}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "4px",
                    border: "1px solid #ddd",
                  }}
                />
              </div>

              <div>
                <h4
                  style={{
                    display: "block",
                    marginBottom: "5px",
                    fontWeight: "bold",
                  }}
                >
                  Start Time
                </h4>
                <input
                  type="time"
                  name="startTime"
                  defaultValue="00:00"
                  required
                  onChange={handleInputChange}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "4px",
                    border: "1px solid #ddd",
                  }}
                />
              </div>

              <div>
                <h4
                  style={{
                    display: "block",
                    marginBottom: "5px",
                    fontWeight: "bold",
                  }}
                >
                  End Time
                </h4>
                <input
                  type="time"
                  name="endTime"
                  defaultValue="00:00"
                  required
                  onChange={handleInputChange}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "4px",
                    border: "1px solid #ddd",
                  }}
                />
              </div>
            </div>

            <input type="hidden" name="timezone" value="America/New_York" />
          </div>

          {/* ========================================================= */}
          {/* SECTION 4.5: Milestones - WITH AUTO PRODUCT IMAGES */}
          {/* ========================================================= */}

          <div
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "15px",
              }}
            >
              <h2 style={{ margin: 0 }}>Milestones</h2>
              <label
                style={{ display: "flex", alignItems: "center", gap: "5px" }}
              >
                <input
                  type="checkbox"
                  checked={enableMilestones}
                  onChange={(e) => setEnableMilestones(e.target.checked)}
                />
                Enable Milestones
              </label>
            </div>

            {enableMilestones && (
              <div>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#666",
                    marginBottom: "15px",
                  }}
                >
                  Set funding goals that unlock rewards for backers. Each
                  milestone will show the product image when reached.
                </p>

                {/* List of milestones */}
                {milestones.length === 0 ? (
                  <div
                    style={{
                      padding: "20px",
                      textAlign: "center",
                      background: "#f8f9fa",
                      borderRadius: "8px",
                      marginBottom: "15px",
                      border: "2px dashed #dee2e6",
                    }}
                  >
                    <p style={{ color: "#6c757d", margin: 0 }}>
                      No milestones added yet. Click &quot;Add Milestone&quot;
                      to create your first milestone.
                    </p>
                  </div>
                ) : (
                  milestones.map((milestone, index) => (
                    <div
                      key={milestone.id}
                      style={{
                        padding: "15px",
                        background: "#f8f9fa",
                        borderRadius: "8px",
                        marginBottom: "15px",
                        border: "1px solid #e9ecef",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "10px",
                        }}
                      >
                        <strong>Milestone #{index + 1}</strong>
                        <button
                          onClick={() => removeMilestone(milestone.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#dc3545",
                            cursor: "pointer",
                            fontSize: "18px",
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      {/* Show product image preview */}
                      {milestone.imageUrl && (
                        <div
                          style={{
                            marginBottom: "15px",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "10px",
                            background: "white",
                            borderRadius: "6px",
                            border: "1px solid #e9ecef",
                          }}
                        >
                          <img
                            src={milestone.imageUrl}
                            alt="Product"
                            style={{
                              width: "50px",
                              height: "50px",
                              objectFit: "cover",
                              borderRadius: "6px",
                              border: "1px solid #dee2e6",
                            }}
                          />
                          <div>
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: "bold",
                                marginBottom: "3px",
                              }}
                            >
                              Product Image
                            </div>
                            <div style={{ fontSize: "11px", color: "#28a745" }}>
                              ✓ This image will show when milestone is reached
                            </div>
                          </div>
                        </div>
                      )}

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 2fr",
                          gap: "10px",
                          marginBottom: "10px",
                        }}
                      >
                        <div>
                          <h4
                            style={{
                              fontSize: "12px",
                              fontWeight: "bold",
                              display: "block",
                              marginBottom: "3px",
                            }}
                          >
                            Target Amount ($)
                          </h4>
                          <input
                            type="number"
                            value={milestone.amount}
                            onChange={(e) =>
                              updateMilestone(
                                milestone.id,
                                "amount",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            min="0"
                            step="0.01"
                            style={{
                              width: "100%",
                              padding: "8px",
                              borderRadius: "4px",
                              border: "1px solid #ddd",
                            }}
                          />
                        </div>
                        <div>
                          <h4
                            style={{
                              fontSize: "12px",
                              fontWeight: "bold",
                              display: "block",
                              marginBottom: "3px",
                            }}
                          >
                            Title
                          </h4>
                          <input
                            type="text"
                            value={milestone.title}
                            onChange={(e) =>
                              updateMilestone(
                                milestone.id,
                                "title",
                                e.target.value,
                              )
                            }
                            placeholder="e.g., Early Bird Special"
                            style={{
                              width: "100%",
                              padding: "8px",
                              borderRadius: "4px",
                              border: "1px solid #ddd",
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <h4
                          style={{
                            fontSize: "12px",
                            fontWeight: "bold",
                            display: "block",
                            marginBottom: "3px",
                          }}
                        >
                          Description (Optional)
                        </h4>
                        <input
                          type="text"
                          value={milestone.description}
                          onChange={(e) =>
                            updateMilestone(
                              milestone.id,
                              "description",
                              e.target.value,
                            )
                          }
                          placeholder="Describe what backers get at this milestone"
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: "4px",
                            border: "1px solid #ddd",
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}

                {/* Add milestone button */}
                <button
                  type="button"
                  onClick={addMilestone}
                  disabled={!selectedProduct}
                  style={{
                    padding: "10px",
                    background: !selectedProduct ? "#e9ecef" : "#f8f9fa",
                    border: !selectedProduct
                      ? "1px solid #dee2e6"
                      : "2px dashed #6c757d",
                    borderRadius: "8px",
                    width: "100%",
                    cursor: !selectedProduct ? "not-allowed" : "pointer",
                    color: !selectedProduct ? "#999" : "#6c757d",
                    fontSize: "14px",
                    fontWeight: "bold",
                    opacity: !selectedProduct ? 0.6 : 1,
                  }}
                >
                  + Add Milestone
                </button>

                {!selectedProduct && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#dc3545",
                      marginTop: "10px",
                    }}
                  >
                    Please select a product first to add milestones
                  </p>
                )}

                <p
                  style={{ fontSize: "12px", color: "#999", marginTop: "10px" }}
                >
                  Milestones should be in increasing order (e.g., $500, $1000,
                  $2000). The product image will automatically appear when each
                  milestone is reached.
                </p>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* Hidden input to pass milestones data */}
          {/* ========================================================= */}

          {enableMilestones && (
            <input
              type="hidden"
              name="milestones"
              value={JSON.stringify(milestones)}
            />
          )}

          {/* ========================================================= */}
          {/* SECTION 5: Addons - NEW */}
          {/* ========================================================= */}

          <div
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "15px",
              }}
            >
              <h2 style={{ margin: 0 }}>Addons</h2>
              <label
                style={{ display: "flex", alignItems: "center", gap: "5px" }}
              >
                <input
                  type="checkbox"
                  checked={enableAddons}
                  onChange={(e) => setEnableAddons(e.target.checked)}
                />
                Enable Addons
              </label>
            </div>

            {enableAddons && (
              <div>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#666",
                    marginBottom: "15px",
                  }}
                >
                  Let customers add extra items to their pledge (helmets,
                  accessories, etc.)
                </p>

                {/* List of addons */}
                {addons.length === 0 ? (
                  <div
                    style={{
                      padding: "20px",
                      textAlign: "center",
                      background: "#f8f9fa",
                      borderRadius: "8px",
                      marginBottom: "15px",
                      border: "2px dashed #dee2e6",
                    }}
                  >
                    <p style={{ color: "#6c757d", margin: 0 }}>
                      No addons added yet. Click &quot;Add Addon&quot; to create
                      your first addon.
                    </p>
                  </div>
                ) : (
                  addons.map((addon, index) => (
                    <div
                      key={addon.id}
                      style={{
                        padding: "15px",
                        background: "#f8f9fa",
                        borderRadius: "8px",
                        marginBottom: "15px",
                        border: "1px solid #e9ecef",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "10px",
                        }}
                      >
                        <strong>Addon #{index + 1}</strong>
                        <button
                          onClick={() => removeAddon(addon.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#dc3545",
                            cursor: "pointer",
                            fontSize: "18px",
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "2fr 1fr",
                          gap: "10px",
                          marginBottom: "10px",
                        }}
                      >
                        <div>
                          <h4
                            style={{
                              fontSize: "12px",
                              fontWeight: "bold",
                              display: "block",
                              marginBottom: "3px",
                            }}
                          >
                            Addon Name
                          </h4>
                          <input
                            type="text"
                            value={addon.name}
                            onChange={(e) =>
                              updateAddon(addon.id, "name", e.target.value)
                            }
                            placeholder="e.g., Helmet, Gloves, Warranty"
                            style={{
                              width: "100%",
                              padding: "8px",
                              borderRadius: "4px",
                              border: "1px solid #ddd",
                            }}
                          />
                        </div>
                        <div>
                          <h4
                            style={{
                              fontSize: "12px",
                              fontWeight: "bold",
                              display: "block",
                              marginBottom: "3px",
                            }}
                          >
                            Price ($)
                          </h4>
                          <input
                            type="number"
                            value={addon.price}
                            onChange={(e) =>
                              updateAddon(
                                addon.id,
                                "price",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            style={{
                              width: "100%",
                              padding: "8px",
                              borderRadius: "4px",
                              border: "1px solid #ddd",
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: "10px" }}>
                        <h4
                          style={{
                            fontSize: "12px",
                            fontWeight: "bold",
                            display: "block",
                            marginBottom: "3px",
                          }}
                        >
                          Description (Optional)
                        </h4>
                        <input
                          type="text"
                          value={addon.description || ""}
                          onChange={(e) =>
                            updateAddon(addon.id, "description", e.target.value)
                          }
                          placeholder="Brief description of this addon"
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: "4px",
                            border: "1px solid #ddd",
                          }}
                        />
                      </div>

                      {/* Optional: Add image later */}
                      <div style={{ fontSize: "12px", color: "#999" }}>
                        {selectedProduct?.image && (
                          <span>✓ Will use product image by default</span>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {/* Add addon button */}
                <button
                  type="button"
                  onClick={addAddon}
                  disabled={!selectedProduct}
                  style={{
                    padding: "10px",
                    background: !selectedProduct ? "#e9ecef" : "#f8f9fa",
                    border: !selectedProduct
                      ? "1px solid #dee2e6"
                      : "2px dashed #6c757d",
                    borderRadius: "8px",
                    width: "100%",
                    cursor: !selectedProduct ? "not-allowed" : "pointer",
                    color: !selectedProduct ? "#999" : "#6c757d",
                    fontSize: "14px",
                    fontWeight: "bold",
                    opacity: !selectedProduct ? 0.6 : 1,
                  }}
                >
                  + Add Addon
                </button>

                {!selectedProduct && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#dc3545",
                      marginTop: "10px",
                    }}
                  >
                    Please select a product first to add addons
                  </p>
                )}

                <p
                  style={{ fontSize: "12px", color: "#999", marginTop: "10px" }}
                >
                  Addons appear in a modal when customers click the pledge
                  button.
                </p>
              </div>
            )}
          </div>

          {/* Hidden input to pass addons data */}
          {enableAddons && (
            <input type="hidden" name="addons" value={JSON.stringify(addons)} />
          )}

          {/* Save Changes Button */}
          <div
            style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
          >
            <button
              type="button"
              onClick={() => navigate("/app/dashboard")}
              style={{
                padding: "12px 24px",
                background: "white",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "16px",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "12px 24px",
                background: "#008060",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "16px",
              }}
            >
              Save Campaign
            </button>
          </div>
        </Form>
      </div>

      {/* Right Column - Preview Widget */}
      <div>
        <CampaignPreview
          formData={formData}
          selectedProduct={selectedProduct}
          shop={shop}
        />
      </div>
    </div>
  );
}
