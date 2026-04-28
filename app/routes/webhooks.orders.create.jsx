import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin, payload, topic, shop } = await authenticate.webhook(request);

  let orderPayload = {};
  if (payload && typeof payload === "object") {
    orderPayload = payload;
  } else if (typeof payload === "string") {
    try {
      orderPayload = JSON.parse(payload);
    } catch {
      orderPayload = {};
    }
  }

  const orderId = orderPayload.id ?? null;
  const customerId = orderPayload.customer?.id ?? null;
  const orderTotal =
    orderPayload.current_total_price ??
    orderPayload.total_price ??
    orderPayload.total_outstanding ??
    null;

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log(
    `[orders/create] orderId=${orderId} customerId=${customerId} orderTotal=${orderTotal}`,
  );

  if (!customerId) {
    console.log("[orders/create] Order has no customer");
    return new Response();
  }

  if (!admin) {
    console.log("[orders/create] No admin client available");
    return new Response();
  }

  const customerGid = String(customerId).startsWith("gid://shopify/Customer/")
    ? String(customerId)
    : `gid://shopify/Customer/${customerId}`;

  const dataQueryResponse = await admin.graphql(
    `#graphql
      query loyaltyWebhookData($customerId: ID!) {
        currentAppInstallation {
          metafield(namespace: "loyalty", key: "settings") {
            value
          }
        }
        customer(id: $customerId) {
          metafield(namespace: "$app:loyalty", key: "points") {
            value
          }
        }
      }`,
    {
      variables: {
        customerId: customerGid,
      },
    },
  );
  const dataQueryJson = await dataQueryResponse.json();

  const settingsRaw =
    dataQueryJson?.data?.currentAppInstallation?.metafield?.value ?? null;
  let pointsPerDollar = 0;
  if (settingsRaw) {
    try {
      const parsedSettings = JSON.parse(settingsRaw);
      const parsedPointsPerDollar = Number(parsedSettings?.pointsPerDollar);
      if (Number.isFinite(parsedPointsPerDollar) && parsedPointsPerDollar > 0) {
        pointsPerDollar = parsedPointsPerDollar;
      }
    } catch (_error) {
      pointsPerDollar = 0;
    }
  }

  const currentPointsRaw = dataQueryJson?.data?.customer?.metafield?.value ?? null;
  const parsedCurrentPoints = Number(currentPointsRaw);
  const currentPoints = Number.isFinite(parsedCurrentPoints)
    ? parsedCurrentPoints
    : 0;

  const parsedOrderTotal = Number(orderTotal);
  const safeOrderTotal = Number.isFinite(parsedOrderTotal) ? parsedOrderTotal : 0;
  const earnedPoints = Math.round(safeOrderTotal * pointsPerDollar);
  const updatedPoints = currentPoints + earnedPoints;

  console.log(`[orders/create] orderTotal=${safeOrderTotal}`);
  console.log(`[orders/create] pointsPerDollar=${pointsPerDollar}`);
  console.log(`[orders/create] currentPoints=${currentPoints}`);
  console.log(`[orders/create] earnedPoints=${earnedPoints}`);
  console.log(`[orders/create] updatedPoints=${updatedPoints}`);

  const savePointsResponse = await admin.graphql(
    `#graphql
      mutation updateCustomerLoyaltyPoints($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
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
            ownerId: customerGid,
            namespace: "$app:loyalty",
            key: "points",
            type: "number_integer",
            value: String(updatedPoints),
          },
        ],
      },
    },
  );
  const savePointsJson = await savePointsResponse.json();
  const savePointsErrors = savePointsJson?.data?.metafieldsSet?.userErrors ?? [];
  if (savePointsErrors.length > 0) {
    console.log(
      `[orders/create] Failed to save points: ${savePointsErrors[0].message}`,
    );
  }

  return new Response();
};