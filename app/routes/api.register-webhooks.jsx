// app/routes/api.register-webhooks.jsx
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

    // ✅ Apne current URL ko dynamic tareeqe se uthayen
  // eslint-disable-next-line no-undef
  const BASE_URL = process.env.SHOPIFY_APP_URL;

  const webhooks = [
    {
      topic: "ORDERS_PAID",
      address: `${BASE_URL}/webhooks/app/orders-paid`,
      format: "JSON",
    },
    {
      topic: "SUBSCRIPTION_CONTRACTS_CREATE",
      address: `${BASE_URL}/webhooks/app/subscription`,
      format: "JSON",
    },
    {
      topic: "SUBSCRIPTION_CONTRACTS_UPDATE",
      address: `${BASE_URL}/webhooks/app/subscription`,
      format: "JSON",
    },
    {
      topic: "SUBSCRIPTION_BILLING_CYCLE_EDITS",
      address: `${BASE_URL}/webhooks/app/subscription`,
      format: "JSON",
    },
  ];


  const results = [];

  for (const webhook of webhooks) {
    try {
      const response = await admin.graphql(
        `mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
              endpoint {
                __typename
                ... on WebhookHttpEndpoint {
                  callbackUrl
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
            topic: webhook.topic,
            webhookSubscription: {
              callbackUrl: webhook.address,
              format: webhook.format,
            },
          },
        },
      );

      const data = await response.json();

      if (data.data?.webhookSubscriptionCreate?.userErrors?.length > 0) {
        results.push({
          topic: webhook.topic,
          success: false,
          errors: data.data.webhookSubscriptionCreate.userErrors,
        });
      } else {
        results.push({
          topic: webhook.topic,
          success: true,
          data: data.data?.webhookSubscriptionCreate?.webhookSubscription,
        });
      }
    } catch (error) {
      results.push({
        topic: webhook.topic,
        success: false,
        errors: [{ message: error.message }],
      });
    }
  }

  return new Response(
    JSON.stringify(
      { results, message: "Webhook registration complete" },
      null,
      2,
    ),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

// Also handle POST requests
export async function action({ request }) {
  return loader({ request });
}
