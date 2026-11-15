/**
 * Social login token verification (Google & Facebook).
 *
 * The browser obtains a token from the provider; the backend NEVER trusts profile data sent by the
 * client. It verifies the token with the provider and uses only the identity returned by that check.
 *
 * Environment variables:
 *   GOOGLE_CLIENT_ID      OAuth 2.0 Web client ID (Google Cloud Console)
 *   FACEBOOK_APP_ID       Facebook App ID
 *   FACEBOOK_APP_SECRET   Facebook App Secret (server-side only, never sent to the browser)
 *
 * Requires Node 18+ (global fetch).
 */

const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com/v27.0';
const REQUEST_TIMEOUT_MS = 8000;

class SocialAuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = 'SocialAuthError';
    this.status = status;
  }
}

function env(name) {
  return String(process.env[name] || '').trim();
}

/** Simulated phone OTP login is a demo feature: disabled in production unless explicitly enabled. */
function isPhoneDemoEnabled() {
  return process.env.NODE_ENV !== 'production' || env('ALLOW_SIMULATED_PHONE_LOGIN') === 'true';
}

/** Public, non-secret settings the browser needs to start the provider login flow. */
function getPublicConfig() {
  const googleClientId = env('GOOGLE_CLIENT_ID');
  const facebookAppId = env('FACEBOOK_APP_ID');
  const facebookConfigured = Boolean(facebookAppId && env('FACEBOOK_APP_SECRET'));
  return {
    google: { enabled: Boolean(googleClientId), clientId: googleClientId || null },
    facebook: { enabled: facebookConfigured, appId: facebookConfigured ? facebookAppId : null },
    phoneDemo: isPhoneDemoEnabled()
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data: data || {} };
  } catch (_err) {
    throw new SocialAuthError('Could not reach the login provider. Please try again.', 502);
  } finally {
    clearTimeout(timer);
  }
}

function safeAvatar(url) {
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : '';
}

/** Verifies a Google ID token (the "credential" returned by Google Identity Services). */
async function verifyGoogleIdToken(idToken) {
  const clientId = env('GOOGLE_CLIENT_ID');
  if (!clientId) throw new SocialAuthError('Google login is not configured on this server.', 503);

  const { ok, data } = await fetchJson(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
  if (!ok || !data.sub) throw new SocialAuthError('Invalid Google token.');
  if (data.aud !== clientId) throw new SocialAuthError('Google token was not issued for this application.');
  if (!GOOGLE_ISSUERS.includes(data.iss)) throw new SocialAuthError('Invalid Google token issuer.');
  if (!(Number(data.exp) * 1000 > Date.now())) throw new SocialAuthError('Google token has expired.');

  return {
    provider: 'gmail',
    providerId: String(data.sub),
    email: data.email ? String(data.email).trim().toLowerCase() : null,
    emailVerified: data.email_verified === true || data.email_verified === 'true',
    name: data.name ? String(data.name).trim() : '',
    avatarUrl: safeAvatar(data.picture)
  };
}

/** Verifies a Facebook user access token and loads the profile with it. */
async function verifyFacebookAccessToken(accessToken) {
  const appId = env('FACEBOOK_APP_ID');
  const appSecret = env('FACEBOOK_APP_SECRET');
  if (!appId || !appSecret) throw new SocialAuthError('Facebook login is not configured on this server.', 503);

  const appToken = `${appId}|${appSecret}`;
  const debug = await fetchJson(
    `${FACEBOOK_GRAPH_URL}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`
  );
  const info = debug.data && debug.data.data;
  if (!debug.ok || !info || info.is_valid !== true) throw new SocialAuthError('Invalid Facebook token.');
  if (String(info.app_id) !== appId) throw new SocialAuthError('Facebook token was not issued for this application.');
  if (info.expires_at && Number(info.expires_at) * 1000 < Date.now()) {
    throw new SocialAuthError('Facebook token has expired.');
  }

  const me = await fetchJson(
    `${FACEBOOK_GRAPH_URL}/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`
  );
  if (!me.ok || !me.data.id) throw new SocialAuthError('Could not read the Facebook profile.');
  if (info.user_id && String(info.user_id) !== String(me.data.id)) {
    throw new SocialAuthError('Facebook token does not match the profile.');
  }

  const email = me.data.email ? String(me.data.email).trim().toLowerCase() : null;
  const picture = me.data.picture && me.data.picture.data ? me.data.picture.data.url : '';
  return {
    provider: 'facebook',
    providerId: String(me.data.id),
    email,
    // Facebook only returns an email address it has confirmed.
    emailVerified: Boolean(email),
    name: me.data.name ? String(me.data.name).trim() : '',
    avatarUrl: safeAvatar(picture)
  };
}

/** provider: 'gmail' | 'facebook'. Resolves to { provider, providerId, email, emailVerified, name, avatarUrl }. */
async function verifyProviderToken(provider, token) {
  if (provider === 'gmail') return verifyGoogleIdToken(token);
  if (provider === 'facebook') return verifyFacebookAccessToken(token);
  throw new SocialAuthError('Unsupported provider.', 400);
}

module.exports = {
  SocialAuthError,
  getPublicConfig,
  isPhoneDemoEnabled,
  verifyGoogleIdToken,
  verifyFacebookAccessToken,
  verifyProviderToken
};