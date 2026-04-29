import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useState} from "preact/hooks";

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const customerContext = getCheckoutCustomerContext();
  const [message, setMessage] = useState("");
  const [points, setPoints] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const shopify = globalThis.shopify;
  const {isLoggedIn, customerId, email, shop} = customerContext;

  useEffect(() => {
    let cancelled = false;

    async function loadPoints() {
      if (!isLoggedIn) {
        setPoints(0);
        return;
      }

      setIsLoading(true);
      try {
        console.log(
          "[checkout-ui] requesting loyalty points",
          JSON.stringify({customerId, email, shop}),
        );

        const response = await fetch("/api/loyalty-points", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerId,
            email,
            shop,
          }),
        });

        if (!response.ok) {
          console.log("[checkout-ui] loyalty API response not OK", response.status);
          if (!cancelled) setPoints(0);
          return;
        }

        const data = await response.json();
        console.log("[checkout-ui] loyalty API response", data);
        const parsedPoints = Number(data?.points);
        const safePoints =
          Number.isFinite(parsedPoints) && parsedPoints >= 0 ? parsedPoints : 0;
        if (!cancelled) setPoints(safePoints);
      } catch (error) {
        console.log("[checkout-ui] loyalty API request failed", error);
        if (!cancelled) setPoints(0);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadPoints();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, customerId, email, shop]);

  if (!shopify || !shopify.buyerIdentity || !isLoggedIn) {
    return (
      <s-stack>
        <s-text>You have 0 loyalty points</s-text>
        <s-text>Sign in to use loyalty points</s-text>
      </s-stack>
    );
  }

  if (isLoading) {
    return (
      <s-stack>
        <s-text>Loading loyalty points...</s-text>
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

  async function onPointsChange(event) {
    const rawValue = event.currentTarget.value;
    const value = Number(rawValue);

    if (!rawValue || Number.isNaN(value)) {
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
        setMessage("Points saved for redemption.");
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
      <s-number-field
        label="Points to redeem"
        onInput={onPointsChange}
      />
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