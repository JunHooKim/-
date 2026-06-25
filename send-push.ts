import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY = 'BN0uMbCQIW0GrFYAvOr1QIwT0DtkA4JWtQy9rNxp_faMxtoMu-9lrxd8Fn9BUvh8l0oZ16z1R4xwbu3e7qI749g';
const VAPID_PRIVATE_KEY = 'xtoMu-9lrxd8Fn9BUvh8l0oZ16z1R4xwbu3e7qI749g';

function base64urlToUint8Array(base64url: string) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const binary = atob(padded);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

async function getVapidKeys() {
  const privateKeyBytes = base64urlToUint8Array(VAPID_PRIVATE_KEY);
  const publicKeyBytes = base64urlToUint8Array(VAPID_PUBLIC_KEY);

  const privateKey = await crypto.subtle.importKey(
    'raw', privateKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, ['deriveKey', 'deriveBits']
  );

  return { privateKey, publicKeyBytes };
}

async function createVapidHeader(audience: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'JWT' };
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: 'mailto:eindboli@gmail.com'
  };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const unsignedToken = `${encode(header)}.${encode(payload)}`;

  const privateKeyBytes = base64urlToUint8Array(VAPID_PRIVATE_KEY);
  const signingKey = await crypto.subtle.importKey(
    'raw', privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    new TextEncoder().encode(unsignedToken)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `vapid t=${unsignedToken}.${sig}, k=${VAPID_PUBLIC_KEY}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      }
    });
  }

  try {
    const { title, body, exclude_user_id } = await req.json();

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 구독 목록 조회 (발송자 제외)
    let query = sb.from('push_subscriptions').select('*');
    if (exclude_user_id) {
      query = query.neq('user_id', exclude_user_id);
    }
    const { data: subs, error } = await query;
    if (error) throw error;

    const results = await Promise.allSettled(
      (subs || []).map(async (sub) => {
        const url = new URL(sub.endpoint);
        const audience = `${url.protocol}//${url.host}`;
        const vapidHeader = await createVapidHeader(audience);

        const payload = JSON.stringify({ title, body });

        const res = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': vapidHeader,
            'Content-Type': 'application/json',
            'TTL': '60',
          },
          body: payload,
        });

        if (!res.ok && (res.status === 404 || res.status === 410)) {
          // 만료된 구독 삭제
          await sb.from('push_subscriptions').delete().eq('id', sub.id);
        }

        return res.status;
      })
    );

    return new Response(JSON.stringify({ sent: results.length }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});
