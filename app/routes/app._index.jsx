import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const DEFAULT_SETTINGS = {
  pointsPerDollar: 1,
  rewardValuePerPoint: 0.01,
};

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query loyaltySettings {
        shop {
          metafield(namespace: "loyalty", key: "settings") {
            value
          }
        }
      }`,
  );
  const responseJson = await response.json();
  const rawValue = responseJson?.data?.shop?.metafield?.value;

  if (!rawValue) {
    return { settings: DEFAULT_SETTINGS };
  }

  try {
    const parsed = JSON.parse(rawValue);
    const pointsPerDollar = Number(parsed?.pointsPerDollar);
    const rewardValuePerPoint = Number(parsed?.rewardValuePerPoint);

    if (pointsPerDollar > 0 && rewardValuePerPoint > 0) {
      return {
        settings: {
          pointsPerDollar,
          rewardValuePerPoint,
        },
      };
    }
  } catch (_error) {
    // Invalid JSON falls back to defaults.
  }

  return { settings: DEFAULT_SETTINGS };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const pointsPerDollarRaw = formData.get("pointsPerDollar");
  const rewardValuePerPointRaw = formData.get("rewardValuePerPoint");

  const pointsPerDollar = Number(pointsPerDollarRaw);
  const rewardValuePerPoint = Number(rewardValuePerPointRaw);
  const errors = {};

  if (!Number.isFinite(pointsPerDollar) || pointsPerDollar <= 0) {
    errors.pointsPerDollar = "Points per dollar must be a number greater than 0.";
  }

  if (!Number.isFinite(rewardValuePerPoint) || rewardValuePerPoint <= 0) {
    errors.rewardValuePerPoint =
      "Reward value per point must be a number greater than 0.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const shopQueryResponse = await admin.graphql(
    `#graphql
      query loyaltySettingsShopId {
        shop {
          id
        }
      }`,
  );
  const shopQueryJson = await shopQueryResponse.json();
  const ownerId = shopQueryJson?.data?.shop?.id;

  if (!ownerId) {
    return {
      ok: false,
      errors: {
        form: "Could not load the current shop. Please try again.",
      },
    };
  }

  const mutationResponse = await admin.graphql(
    `#graphql
      mutation saveLoyaltySettings($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
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
            ownerId,
            namespace: "loyalty",
            key: "settings",
            type: "json",
            value: JSON.stringify({
              pointsPerDollar,
              rewardValuePerPoint,
            }),
          },
        ],
      },
    },
  );
  const mutationJson = await mutationResponse.json();
  const userErrors = mutationJson?.data?.metafieldsSet?.userErrors ?? [];

  if (userErrors.length > 0) {
    return {
      ok: false,
      errors: {
        form: userErrors[0].message,
      },
    };
  }

  return {
    ok: true,
    settings: {
      pointsPerDollar,
      rewardValuePerPoint,
    },
  };
};

export default function Index() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [pointsPerDollar, setPointsPerDollar] = useState(
    String(settings.pointsPerDollar),
  );
  const [rewardValuePerPoint, setRewardValuePerPoint] = useState(
    String(settings.rewardValuePerPoint),
  );

  const isSaving =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    setPointsPerDollar(String(settings.pointsPerDollar));
    setRewardValuePerPoint(String(settings.rewardValuePerPoint));
  }, [settings.pointsPerDollar, settings.rewardValuePerPoint]);

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Loyalty settings saved");
      if (fetcher.data?.settings) {
        setPointsPerDollar(String(fetcher.data.settings.pointsPerDollar));
        setRewardValuePerPoint(String(fetcher.data.settings.rewardValuePerPoint));
      }
    } else if (fetcher.data?.errors?.form) {
      shopify.toast.show(fetcher.data.errors.form, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const saveSettings = () => {
    fetcher.submit(
      {
        pointsPerDollar,
        rewardValuePerPoint,
      },
      { method: "POST" },
    );
  };

  return (
    <s-page heading="Loyalty Settings">
      <s-section heading="Points configuration">
        <s-paragraph>
          Configure how customers earn and redeem loyalty points in your store.
        </s-paragraph>
        {fetcher.data?.errors?.form ? (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="critical-subdued"
          >
            <s-text>{fetcher.data.errors.form}</s-text>
          </s-box>
        ) : null}
        <div
          style={{
            display: "grid",
            gap: "12px",
            maxWidth: "420px",
            marginTop: "12px",
          }}
        >
          <label>
            <div style={{ marginBottom: "4px", fontWeight: 600 }}>
              Points Per Dollar
            </div>
            <input
              type="number"
              name="pointsPerDollar"
              min="0"
              step="0.01"
              value={pointsPerDollar}
              onChange={(event) => setPointsPerDollar(event.target.value)}
              style={{ width: "100%", padding: "8px" }}
            />
            {fetcher.data?.errors?.pointsPerDollar ? (
              <div style={{ marginTop: "4px", color: "#8e1f0b" }}>
                {fetcher.data.errors.pointsPerDollar}
              </div>
            ) : null}
          </label>

          <label>
            <div style={{ marginBottom: "4px", fontWeight: 600 }}>
              Reward Value Per Point
            </div>
            <input
              type="number"
              name="rewardValuePerPoint"
              min="0"
              step="0.0001"
              value={rewardValuePerPoint}
              onChange={(event) => setRewardValuePerPoint(event.target.value)}
              style={{ width: "100%", padding: "8px" }}
            />
            {fetcher.data?.errors?.rewardValuePerPoint ? (
              <div style={{ marginTop: "4px", color: "#8e1f0b" }}>
                {fetcher.data.errors.rewardValuePerPoint}
              </div>
            ) : null}
          </label>

          <div>
            <s-button
              onClick={saveSettings}
              {...(isSaving ? { loading: true } : {})}
            >
              Save settings
            </s-button>
          </div>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
