/**
 * Centralized environment variable access with safe defaults and clear errors.
 *
 * Each helper:
 *  - Reads `process.env` once at module load (or every call, for mutable ones)
 *  - Provides a sensible default if the var is unset
 *  - Throws on misconfiguration for required secrets
 *
 * Audit ref: Wave 0.12 — ENABLE_TOKEN_ROTATION feature flag for F-3.
 */

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) return defaultValue;
    const normalized = value.toLowerCase().trim();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    console.warn(`[env] Cannot parse boolean value "${value}", using default ${defaultValue}`);
    return defaultValue;
}

/**
 * Enable refresh-token rotation + family-revoke.
 *
 * When false (default): refresh tokens are long-lived but not rotated.
 * When true: each /auth/refresh issues a new refresh token, revokes the old
 * one, and a reused (revoked) token revokes the entire family.
 *
 * Recommended rollout: keep false in production for 1 week after deploy to
 * detect false-positive family revokes, then flip to true via .env.
 */
export const ENABLE_TOKEN_ROTATION = parseBool(process.env.ENABLE_TOKEN_ROTATION, false);
