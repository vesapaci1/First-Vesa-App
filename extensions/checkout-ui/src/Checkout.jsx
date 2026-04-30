import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useState} from "preact/hooks";
import {useAppMetafields} from "@shopify/ui-extensions/checkout/preact";

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const customerContext = getCheckoutCustomerContext();
  const [message, setMessage] = useState("");
  const [inputValue, setInputValue] = useState("");

  const shopify = globalThis.shopify;
  const {isLoggedIn} = customerContext;
  const customerMetafields = useAppMetafields({
    namespace: "$app:loyalty",
    key: "points",
    type: "customer",
  });
  console.log("Customer metafields:", customerMetafields);
  const customerPointsValue = customerMetafields[0]?.metafield?.value;
  const parsedPoints = Number(customerPointsValue);
  const points = Number.isFinite(parsedPoints) && parsedPoints > 0 ? parsedPoints : 0;

  if (!shopify || !shopify.buyerIdentity || !isLoggedIn) {
    return (
      <s-stack>
        <s-text>You have 0 loyalty points</s-text>
        <s-text>Sign in to use loyalty points</s-text>
      </s-stack>
    );
  }

  if (!Number.isFinite(points) || points <= 0) {
    return (
      <s-stack>
        <s-text>You have 0 loyalty points</s-text>
      </s-stack>
    );
  }

  async function handleApply() {
    const value = Number(inputValue);

    if (!inputValue || Number.isNaN(value)) {
      setMessage("Enter a valid number of points.");
      return;
    }

    if (value <= 0) {
      setMessage("Points must be greater than 0.");
      return;
    }

    if (value > points) {
      setMessage("You cannot redeem more points than you have.");
      return;
    }

    try {
      const result = await shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "loyalty_points_to_redeem",
        value: String(value),
      });

      if (result?.type === "success") {
        setMessage("Points applied successfully");
      } else {
        setMessage("We could not save your points. Try again.");
      }
    } catch (_error) {
      setMessage("We could not save your points. Try again.");
    }
  }

  return (
    <s-stack>
      <s-text>{`You have ${points} loyalty points`}</s-text>
      <s-stack direction="inline" alignItems="end" gap="base">
        <s-number-field
          label="Points to redeem"
          value={inputValue}
          onInput={(event) => setInputValue(String((/** @type {any} */ (event.currentTarget)).value ?? ""))}
        />
        <s-button
          disabled={!inputValue || Number.isNaN(Number(inputValue)) || Number(inputValue) <= 0}
          onClick={handleApply}
        >
          Apply
        </s-button>
      </s-stack>
      <s-text>{message}</s-text>
    </s-stack>
  );
}

function getCheckoutCustomerContext() {
  const shopify = globalThis.shopify;

  if (!shopify) {
    console.log("[checkout-ui] shopify API not available");
    return {
      isLoggedIn: false,
      customerId: null,
      email: null,
      shop: null,
    };
  }

  const buyerIdentity = shopify.buyerIdentity;
  const customerSignal = buyerIdentity?.customer;

  if (!customerSignal) {
    console.log("[checkout-ui] buyerIdentity.customer signal missing");
    return {
      isLoggedIn: false,
      customerId: null,
      email: null,
      shop: shopify.shop?.myshopifyDomain ?? null,
    };
  }

  const customer = customerSignal.current;

  if (!customer) {
    console.log("[checkout-ui] guest checkout (no customer)");
    return {
      isLoggedIn: false,
      customerId: null,
      email: null,
      shop: shopify.shop?.myshopifyDomain ?? null,
    };
  }

  const customerId = customer.id ?? null;
  const email = customer.email ?? null;
  const shop = shopify.shop?.myshopifyDomain ?? null;
  console.log("[checkout-ui] customer context", JSON.stringify({customerId, email, shop}));
  return {
    isLoggedIn: true,
    customerId,
    email,
    shop,
  };
}