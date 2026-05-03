import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
} from '../generated/api';


/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  */

/**
  * @param {RunInput} input
  * @returns {CartLinesDiscountsGenerateRunResult}
  */

export function cartLinesDiscountsGenerateRun(input) {
  const rawRedeemedPoints = input.cart.attribute?.value?.trim();
  const redeemedPoints = rawRedeemedPoints ? Number.parseInt(rawRedeemedPoints, 10) : NaN;

  if (!Number.isInteger(redeemedPoints) || redeemedPoints <= 0) {
    return {operations: []};
  }

  const hasOrderDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Order,
  );
  if (!hasOrderDiscountClass) {
    return {operations: []};
  }

  const settingsJson = input.discount.metafield?.jsonValue;
  const rewardValuePerPointRaw =
    settingsJson && typeof settingsJson === 'object'
      ? settingsJson.rewardValuePerPoint
      : undefined;
  const rewardValuePerPoint = Number(rewardValuePerPointRaw);

  if (!Number.isFinite(rewardValuePerPoint) || rewardValuePerPoint <= 0) {
    return {operations: []};
  }

  const discountAmount = redeemedPoints * rewardValuePerPoint;
  if (discountAmount <= 0) {
    return {operations: []};
  }

  return {
    operations: [
      {
        orderDiscountsAdd: {
          selectionStrategy: OrderDiscountSelectionStrategy.First,
          candidates: [
            {
              message: 'Loyalty points redemption',
              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds: [],
                  },
                },
              ],
              value: {
                fixedAmount: {
                  amount: discountAmount,
                },
              },
            },
          ],
        },
      },
    ],
  };
}