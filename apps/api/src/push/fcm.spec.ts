import { createVerify, generateKeyPairSync } from 'node:crypto';
import { FcmPushProvider, parseServiceAccount, type FcmServiceAccount } from './fcm.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const account: FcmServiceAccount = {
  project_id: 'emlook-test',
  client_email: 'push@emlook-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

interface Call {
  url: string;
  init: RequestInit;
}

/** Belirteç uç noktası + mesaj uç noktası için sahte fetch */
function fakeFcm(onMessage: (token: string, n: number) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  let tokenRequests = 0;
  let messages = 0;
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.includes('oauth2')) {
      tokenRequests++;
      return Response.json({ access_token: `erisim-${tokenRequests}`, expires_in: 3600 });
    }
    const token = (JSON.parse(init.body as string) as { message: { token: string } }).message.token;
    const r = onMessage(token, ++messages);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  };
  return { fn, calls, tokenRequests: () => tokenRequests };
}

describe('FcmPushProvider', () => {
  it('servis hesabıyla imzalı JWT ile belirteç alır ve her cihaza HTTP v1 mesajı gönderir', async () => {
    const f = fakeFcm(() => ({ status: 200, body: { name: 'projects/x/messages/1' } }));
    const res = await new FcmPushProvider(account, f.fn).send(['a', 'b'], {
      title: 'Yeni mesaj',
      body: 'Merhaba',
      data: { type: 'message', conversationId: 'c1' },
    });
    expect(res.invalidTokens).toEqual([]);

    const tokenCall = f.calls.find((c) => c.url.includes('oauth2'))!;
    const assertion = new URLSearchParams(tokenCall.init.body as string).get('assertion')!;
    const [h, c, sig] = assertion.split('.');
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString()) as Record<string, unknown>;
    expect(claims).toMatchObject({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
    });
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);

    const sends = f.calls.filter((x) => x.url.includes('fcm.googleapis.com'));
    expect(sends).toHaveLength(2);
    expect(sends[0].url).toBe('https://fcm.googleapis.com/v1/projects/emlook-test/messages:send');
    expect((sends[0].init.headers as Record<string, string>).authorization).toBe('Bearer erisim-1');
    const msg = (JSON.parse(sends[0].init.body as string) as { message: Record<string, unknown> }).message;
    expect(msg.notification).toEqual({ title: 'Yeni mesaj', body: 'Merhaba' });
    expect(msg.data).toEqual({ type: 'message', conversationId: 'c1' });
  });

  it('belirteci önbellekte tutar, süresi dolunca yeniler', async () => {
    let now = 1_800_000_000_000;
    const f = fakeFcm(() => ({ status: 200 }));
    const p = new FcmPushProvider(account, f.fn, () => now);
    await p.send(['a'], { title: 't', body: 'b' });
    await p.send(['b'], { title: 't', body: 'b' });
    expect(f.tokenRequests()).toBe(1);
    now += 3600_000;
    await p.send(['c'], { title: 't', body: 'b' });
    expect(f.tokenRequests()).toBe(2);
  });

  it('kaldırılmış uygulamanın belirtecini geçersiz bildirir, geçici hatayı bildirmez', async () => {
    const f = fakeFcm((token) =>
      token === 'eski'
        ? { status: 404, body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } }
        : token === 'bozuk'
          ? { status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } } }
          : { status: 503, body: { error: { status: 'UNAVAILABLE' } } },
    );
    const res = await new FcmPushProvider(account, f.fn).send(['eski', 'bozuk', 'gecici', 'eski'], {
      title: 't',
      body: 'b',
    });
    expect(res.invalidTokens.sort()).toEqual(['bozuk', 'eski']);
  });

  it('401 alırsa belirteci yenileyip bir kez yeniden dener', async () => {
    const f = fakeFcm((_, n) => (n === 1 ? { status: 401 } : { status: 200 }));
    const res = await new FcmPushProvider(account, f.fn).send(['a'], { title: 't', body: 'b' });
    expect(res.invalidTokens).toEqual([]);
    expect(f.tokenRequests()).toBe(2);
  });

  it('servis hesabını ham veya base64 JSON olarak okur', () => {
    const json = JSON.stringify({ ...account, private_key: account.private_key.replace(/\n/g, '\\n') });
    expect(parseServiceAccount(json).private_key).toBe(account.private_key);
    expect(parseServiceAccount(Buffer.from(json).toString('base64')).project_id).toBe('emlook-test');
    expect(() => parseServiceAccount('{"project_id":"x"}')).toThrow('client_email');
    expect(() => parseServiceAccount('bozuk')).toThrow('JSON');
  });
});
