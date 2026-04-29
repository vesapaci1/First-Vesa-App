export default function extension() {
  const points = getLoyaltyPoints();

  const text = document.createElement("s-text");
  text.textContent = `You have ${points} loyalty points`;

  document.body.appendChild(text);
}

function getLoyaltyPoints() {
  const shopify = globalThis.shopify;

  if (!shopify) {
    return 0;
  }

  const buyerIdentity = shopify.buyerIdentity;
  const customerSignal = buyerIdentity?.customer;

  if (!customerSignal) {
    return 0;
  }

  const customer = customerSignal.current;

  if (!customer) {
    return 0;
  }

  const metafields = customer["metafields"];

  if (!Array.isArray(metafields)) {
    return 0;
  }

  const loyaltyMetafield = metafields.find(
    (metafield) =>
      metafield?.namespace === "$app:loyalty" &&
      metafield?.key === "points",
  );

  if (!loyaltyMetafield || loyaltyMetafield.value == null) {
    return 0;
  }

  const parsed = Number(loyaltyMetafield.value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}