const SECOND_PER_DAY = 86400;
// Stripe idempotency keys can be removed after 24 hours. Never replay an old
// incomplete activation automatically because its remote result may already exist.
const RETRY_WINDOW = 23 * 3600;
const stripePriceId = /^price_[a-zA-Z0-9]+$/;
const stripeCustomerId = /^cus_[a-zA-Z0-9]+$/;
const stripeSubscriptionId = /^sub_[a-zA-Z0-9]+$/;

export function tastingConfig(env) {
  const mode = env.STRIPE_TASTING_MODE;
  const secret = env.STRIPE_TASTING_SECRET_KEY;
  const priceId = env.STRIPE_TASTING_PRICE_ID;
  const days = Number(env.STRIPE_TASTING_DAYS);
  if (!["test", "live"].includes(mode) || !stripePriceId.test(priceId ?? "") ||
      !/^(0|[1-9]\d*)$/.test(env.STRIPE_TASTING_DAYS ?? "") ||
      !Number.isSafeInteger(days * SECOND_PER_DAY) ||
      !new RegExp("^(sk|rk)_" + mode + "_[a-zA-Z0-9]+$").test(secret ?? "")) return null;
  return {mode, secret, priceId, days};
}

async function stripe(config, resource, params, key) {
  const headers = {
    Authorization:"Bearer " + config.secret,
    "Stripe-Version":"2025-08-27.basil"
  };
  if (params) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    headers["Idempotency-Key"] = key;
  }
  const response = await fetch("https://api.stripe.com/v1/" + resource, {
    headers, method:params ? "POST" : "GET", redirect:"error",
    signal:AbortSignal.timeout(8000), ...(params ? {body:new URLSearchParams(params)} : {})
  });
  if (!response.ok) throw new Error("Stripe tasting request failed");
  const object = await response.json();
  if (object.livemode !== (config.mode === "live")) throw new Error("Stripe tasting mode mismatch");
  return object;
}

export function tastingRecord(db, userId, mode) {
  return db.prepare("SELECT * FROM stream_tasting WHERE user_id=? AND stripe_mode=?")
    .bind(userId, mode).first();
}

function freePrice(price, id) {
  return price.id === id && price.unit_amount === 0 && price.currency === "brl" &&
    price.billing_scheme === "per_unit" && price.type === "recurring" &&
    price.recurring?.usage_type === "licensed";
}

export async function tastingStatus(config, record, now) {
  if (!record) return "available";
  if (record.ends_at !== null && record.ends_at <= now) return "expired";
  if (!record.stripe_subscription_id) {
    return now - record.started_at < RETRY_WINDOW ? "pending" : "review";
  }
  const subscription = await stripe(config, "subscriptions/" + record.stripe_subscription_id);
  if (subscription.id !== record.stripe_subscription_id ||
      subscription.customer !== record.stripe_customer_id) throw new Error("Stripe tasting account mismatch");
  if (subscription.status === "canceled") return "expired";
  return subscription.status === "active" && subscription.items?.data?.length === 1 &&
    freePrice(subscription.items.data[0].price, record.price_id) ? "active" : "review";
}

export async function startTasting(db, config, userId, now) {
  let record = await tastingRecord(db, userId, config.mode);
  if (record?.stripe_subscription_id) return;
  if (record && (now - record.started_at >= RETRY_WINDOW ||
                 (record.ends_at !== null && record.ends_at <= now))) return;

  // Stripe's base currency and unit amount are immutable for this Price.
  // Validate even on a retry before requesting any subscription.
  const priceId = record?.price_id ?? config.priceId;
  const price = await stripe(config, "prices/" + priceId);
  if (!price.active || !freePrice(price, priceId)) throw new Error("Degustação requires a free recurring BRL Price");
  if (!record) {
    await db.prepare(
      "INSERT OR IGNORE INTO stream_tasting(user_id,stripe_mode,attempt_id,price_id,started_at,ends_at) VALUES(?,?,?,?,?,?)"
    ).bind(userId, config.mode, crypto.randomUUID(), priceId, now,
      config.days ? now + config.days * SECOND_PER_DAY : null).run();
    record = await tastingRecord(db, userId, config.mode);
    if (record.stripe_subscription_id) return;
    // A simultaneous first activation could have reserved a different configured Price.
    if (record.price_id !== priceId) throw new Error("Stripe tasting price changed during activation");
  }

  let customerId = record.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe(config, "customers", {
      "metadata[stream_now_tasting]":record.attempt_id
    }, "stream-now-tasting-customer-" + record.attempt_id);
    if (!stripeCustomerId.test(customer.id ?? "")) throw new Error("Unexpected Stripe tasting customer");
    customerId = customer.id;
    await db.prepare(
      "UPDATE stream_tasting SET stripe_customer_id=? WHERE user_id=? AND stripe_mode=? AND stripe_customer_id IS NULL"
    ).bind(customerId, userId, config.mode).run();
  }

  const subscription = await stripe(config, "subscriptions", {
    customer:customerId, currency:"brl", collection_method:"charge_automatically",
    "items[0][price]":record.price_id, "items[0][quantity]":"1",
    "automatic_tax[enabled]":"false", payment_behavior:"default_incomplete",
    proration_behavior:"none",
    "metadata[stream_now_tasting]":record.attempt_id,
    ...(record.ends_at !== null ? {cancel_at:String(record.ends_at)} : {})
  }, "stream-now-tasting-subscription-" + record.attempt_id);
  if (!stripeSubscriptionId.test(subscription.id ?? "") ||
      subscription.customer !== customerId) throw new Error("Unexpected Stripe tasting subscription");
  await db.prepare(
    "UPDATE stream_tasting SET stripe_subscription_id=? WHERE user_id=? AND stripe_mode=? AND stripe_subscription_id IS NULL"
  ).bind(subscription.id, userId, config.mode).run();
}
