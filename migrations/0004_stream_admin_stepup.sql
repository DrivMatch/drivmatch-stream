-- Stream incident remediation 2026-11-23: short-lived privileged re-auth.
-- Sessions remain personal; administrator panels require recent password proof.
ALTER TABLE stream_sessions ADD COLUMN admin_verified_until INTEGER NOT NULL DEFAULT 0;
