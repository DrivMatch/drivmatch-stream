CREATE TABLE stream_tasting (
  user_id TEXT NOT NULL REFERENCES stream_users(user_id) ON DELETE CASCADE,
  stripe_mode TEXT NOT NULL CHECK(stripe_mode IN ('test', 'live')),
  attempt_id TEXT NOT NULL UNIQUE,
  price_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  PRIMARY KEY (user_id, stripe_mode)
);
