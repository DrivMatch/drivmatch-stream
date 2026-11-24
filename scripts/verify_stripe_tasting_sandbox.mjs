import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {startTasting, tastingConfig, tastingRecord, tastingStatus} from "../cloudflare/stripe-tasting.mjs";

const config = tastingConfig({...process.env, STRIPE_TASTING_MODE:"test", STRIPE_TASTING_DAYS:"0"});
assert.ok(config, "Configure a Stripe Sandbox secret and a zero-price BRL recurring Price");

async function stripe(path, method = "GET") {
  const response = await fetch("https://api.stripe.com/v1/" + path, {
    method,
    headers:{Authorization:"Bearer " + config.secret, "Stripe-Version":"2025-08-27.basil"},
    redirect:"error",
    signal:AbortSignal.timeout(10000)
  });
  assert.ok(response.ok, "Stripe Sandbox " + method + " returned HTTP " + response.status);
  const object = await response.json();
  assert.notEqual(object.livemode,true, "Stripe response must be from Sandbox");
  return object;
}

const database = new DatabaseSync(":memory:");
for (const migration of ["0001_stream_identities.sql", "0005_stream_tasting.sql"]) {
  database.exec(readFileSync(new URL("../migrations/" + migration, import.meta.url),"utf8"));
}
const db = {
  prepare(sql) {
    const statement = database.prepare(sql);
    return {bind(...args) {
      return {first:async () => statement.get(...args), run:async () => statement.run(...args)};
    }};
  }
};

async function verifyPlan(days) {
  const userId = "stripe-sandbox-qa-" + crypto.randomUUID();
  database.prepare("INSERT INTO stream_users(user_id,email,status) VALUES(?,?,'active')")
    .run(userId, userId + "@example.test");
  const now = Math.floor(Date.now() / 1000);
  try {
    const plan = {...config, days};
    await startTasting(db, plan, userId, now);
    await startTasting(db, plan, userId, now + 1);
    const record = await tastingRecord(db, userId, plan.mode);
    assert.ok(record?.stripe_subscription_id, "Activation did not save a Stripe Sandbox subscription");
    assert.ok(await tastingStatus(plan, record, now) === "active", "Sandbox tasting did not become active");
    const subscription = await stripe("subscriptions/" + record.stripe_subscription_id);
    assert.ok(subscription.customer === record.stripe_customer_id, "Subscription and disposable customer differ");
    assert.ok(subscription.cancel_at === (days ? now + days * 86400 : null), "Unexpected cancellation date");
    assert.equal(subscription.default_payment_method,null);
    assert.ok(typeof subscription.latest_invoice === "string", "Stripe did not create an invoice for verification");
    const invoice = await stripe("invoices/" + subscription.latest_invoice);
    assert.ok(invoice.amount_due === 0 && invoice.amount_paid === 0 && invoice.currency === "brl",
      "Stripe invoice was not exactly R$ 0,00");
    const methods = await stripe("customers/" + record.stripe_customer_id + "/payment_methods");
    assert.equal(methods.data.length,0);
  } finally {
    const record = await tastingRecord(db, userId, config.mode);
    if (record?.stripe_customer_id) {
      const customer = await stripe("customers/" + record.stripe_customer_id);
      assert.ok(customer.metadata?.stream_now_tasting === record.attempt_id,
        "Cleanup refused because the customer does not match this run");
      assert.equal((await stripe("customers/" + record.stripe_customer_id,"DELETE")).deleted,true);
    }
  }
}

try {
  await verifyPlan(0);
  await verifyPlan(7);
  console.log("Stripe Sandbox verified R$ 0,00 invoices, no attached payment methods and fixture cleanup.");
} finally {
  database.close();
}
