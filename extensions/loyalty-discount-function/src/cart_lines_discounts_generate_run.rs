use super::schema;
use shopify_function::Result;
use shopify_function::prelude::*;

#[shopify_function]
fn cart_lines_discounts_generate_run(
    input: schema::cart_lines_discounts_generate_run::Input,
) -> Result<schema::CartLinesDiscountsGenerateRunResult> {
    let redeemed_points = input
        .cart()
        .attribute()
        .and_then(|attribute| attribute.value().as_ref())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|points| *points > 0);

    if redeemed_points.is_none() {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    // Placeholder: discount calculation and operations will be added next.
    Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] })
}
