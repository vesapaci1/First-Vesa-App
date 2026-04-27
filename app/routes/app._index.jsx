import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const DEFAULT_SETTINGS = {
  pointsPerDollar: 1,
  rewardValuePerPoint: 0.01,
};

function parseLoyaltySettings(rawValue) {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    const pointsPerDollar = Number(parsed?.pointsPerDollar);
    const rewardValuePerPoint = Number(parsed?.rewardValuePerPoint);

    if (pointsPerDollar > 0 && rewardValuePerPoint > 0) {
      return {
        pointsPerDollar,
        rewardValuePerPoint,
      };
    }
  } catch (_error) {
    // Invalid JSON falls back safely.
  }

  return null;
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query loyaltySettings {
        currentAppInstallation {
          metafield(namespace: "loyalty", key: "settings") {
            value
          }
        }
      }`,
  );
  const responseJson = await response.json();
  const rawValue = responseJson?.data?.currentAppInstallation?.metafield?.value;
  const parsedSettings = parseLoyaltySettings(rawValue);
  return { settings: parsedSettings ?? DEFAULT_SETTINGS };
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

  const idsQueryResponse = await admin.graphql(
    `#graphql
      query loyaltySettingsOwnerIds {
        currentAppInstallation {
          id
        }
      }`,
  );
  const idsQueryJson = await idsQueryResponse.json();
  // App-owned metafield: ownerId is the AppInstallation id, not the Shop id.
  const appInstallationId = idsQueryJson?.data?.currentAppInstallation?.id;

  if (!appInstallationId) {
    return {
      ok: false,
      errors: {
        form: "Could not load app installation. Please try again.",
      },
    };
  }

  const saveSettingsResponse = await admin.graphql(
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
            // Source of truth: app-owned loyalty settings on currentAppInstallation.
            ownerId: appInstallationId,
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
  const saveSettingsJson = await saveSettingsResponse.json();
  const saveSettingsErrors = saveSettingsJson?.data?.metafieldsSet?.userErrors ?? [];

  if (saveSettingsErrors.length > 0) {
    return {
      ok: false,
      errors: {
        form: saveSettingsErrors[0].message,
      },
    };
  }

  const storefrontSyncQueryResponse = await admin.graphql(
    `#graphql
      query storefrontSyncSource {
        currentAppInstallation {
          metafield(namespace: "loyalty", key: "settings") {
            value
          }
        }
        shop {
          id
        }
      }`,
  );
  const storefrontSyncQueryJson = await storefrontSyncQueryResponse.json();
  const storefrontRawSettings =
    storefrontSyncQueryJson?.data?.currentAppInstallation?.metafield?.value;
  const storefrontSettings = parseLoyaltySettings(storefrontRawSettings);
  const storefrontPointsPerDollar = storefrontSettings?.pointsPerDollar ?? 0;
  const shopId = storefrontSyncQueryJson?.data?.shop?.id;

  if (!shopId) {
    return {
      ok: false,
      errors: {
        form: "Could not load shop information for storefront sync.",
      },
    };
  }

  const storefrontSyncResponse = await admin.graphql(
    `#graphql
      mutation syncStorefrontPoints($metafields: [MetafieldsSetInput!]!) {
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
            // Read-only storefront projection derived from app metafield source.
            ownerId: shopId,
            namespace: "loyalty",
            key: "points_per_dollar_public",
            type: "number_decimal",
            value: String(storefrontPointsPerDollar),
          },
        ],
      },
    },
  );
  const storefrontSyncJson = await storefrontSyncResponse.json();
  const storefrontSyncErrors =
    storefrontSyncJson?.data?.metafieldsSet?.userErrors ?? [];

  if (storefrontSyncErrors.length > 0) {
    return {
      ok: false,
      errors: {
        form: storefrontSyncErrors[0].message,
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
