import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);

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

  return new Response();
};
