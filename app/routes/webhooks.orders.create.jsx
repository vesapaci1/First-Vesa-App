import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin, payload, topic, shop } = await authenticate.webhook(request);

  let orderPayload = {};
  if (payload && typeof payload === "object") {
    orderPayload = payload;
  } else if (typeof payload === "string") {
    try {
      orderPayload = JSON.parse(payload);
      console.log("orderPayload", orderPayload);
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
  let rewardValuePerPoint = 0;
  if (settingsRaw) {
    try {
      const parsedSettings = JSON.parse(settingsRaw);
      const parsedPointsPerDollar = Number(parsedSettings?.pointsPerDollar);
      const parsedRewardValuePerPoint = Number(parsedSettings?.rewardValuePerPoint);
      if (Number.isFinite(parsedPointsPerDollar) && parsedPointsPerDollar > 0) {
        pointsPerDollar = parsedPointsPerDollar;
      }
      if (
        Number.isFinite(parsedRewardValuePerPoint) &&
        parsedRewardValuePerPoint > 0
      ) {
        rewardValuePerPoint = parsedRewardValuePerPoint;
      }
    } catch (_error) {
      pointsPerDollar = 0;
      rewardValuePerPoint = 0;
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

  const discountApplications = Array.isArray(orderPayload.discount_applications)
    ? orderPayload.discount_applications
    : [];
  const loyaltyDiscountAppIndex = discountApplications.findIndex(
    (discountApplication) =>
      discountApplication?.title === "Loyalty points redemption",
  );
  const loyaltyDiscountApplication =
    loyaltyDiscountAppIndex >= 0 ? discountApplications[loyaltyDiscountAppIndex] : null;

  let redeemedDiscountValue = 0;

  // Prefer allocation-level values when present so we can map the exact applied amount.
  if (loyaltyDiscountAppIndex >= 0 && Array.isArray(orderPayload.line_items)) {
    for (const lineItem of orderPayload.line_items) {
      const lineItemAllocations = Array.isArray(lineItem?.discount_allocations)
        ? lineItem.discount_allocations
        : [];
      for (const allocation of lineItemAllocations) {
        if (allocation?.discount_application_index !== loyaltyDiscountAppIndex) {
          continue;
        }
        const allocationAmount = Number(
          allocation?.amount ??
            allocation?.amount_set?.shop_money?.amount ??
            allocation?.amount_set?.presentment_money?.amount ??
            0,
        );
        if (Number.isFinite(allocationAmount) && allocationAmount > 0) {
          redeemedDiscountValue += allocationAmount;
        }
      }
    }
  }

  if (redeemedDiscountValue <= 0 && loyaltyDiscountApplication) {
    const appValue = Number(loyaltyDiscountApplication?.value ?? 0);
    if (Number.isFinite(appValue) && appValue > 0) {
      redeemedDiscountValue = appValue;
    }
  }

  const parsedRedeemedPoints =
    rewardValuePerPoint > 0 ? redeemedDiscountValue / rewardValuePerPoint : 0;
  const redeemedPoints =
    Number.isFinite(parsedRedeemedPoints) && parsedRedeemedPoints > 0
      ? Math.round(parsedRedeemedPoints)
      : 0;
  const calculatedBalance = currentPoints + earnedPoints - redeemedPoints;
  const updatedPoints = Math.max(0, Number.isFinite(calculatedBalance) ? calculatedBalance : 0);

  console.log(`[orders/create] orderTotal=${safeOrderTotal}`);
  console.log(`[orders/create] pointsPerDollar=${pointsPerDollar}`);
  console.log(`[orders/create] currentPoints=${currentPoints}`);
  console.log(`[orders/create] earnedPoints=${earnedPoints}`);
  console.log(`[orders/create] redeemedPoints=${redeemedPoints}`);
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