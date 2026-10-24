import { NetgsmSmsService, toNetgsmNumber, type NetgsmConfig } from './netgsm.js';
import { SmsDeliveryError } from './sms.service.js';

const config: NetgsmConfig = {
  userCode: '8501234567',
  password: 'gizli',
  header: 'EMLOOK',
  useOtpEndpoint: true,
  baseUrl: 'https://api.netgsm.test',
};

function fakeFetch(...responses: { status?: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  };
  return { fn, calls };
}

describe('NetgsmSmsService', () => {
  it('OTP uç noktasına Basic auth ve JSON gövdeyle gönderir', async () => {
    const f = fakeFetch({ body: { code: '00', jobid: '17377215342605050417149344' } });
    await new NetgsmSmsService(config, f.fn).send('+905321234567', 'Emlook giris kodunuz: 123456');

    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0];
    expect(url).toBe('https://api.netgsm.test/sms/rest/v2/otp');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Basic ' + Buffer.from('8501234567:gizli').toString('base64'));
    expect(JSON.parse(init.body as string)).toEqual({
      msgheader: 'EMLOOK',
      encoding: 'ASCII',
      messages: [{ msg: 'Emlook giris kodunuz: 123456', no: '5321234567' }],
    });
  });

  it('normal gönderimde Türkçe karakter için TR kodlaması ister', async () => {
    const f = fakeFetch({ body: { code: '00', jobid: 1 } });
    await new NetgsmSmsService({ ...config, useOtpEndpoint: false }, f.fn).send('+905321234567', 'Ödemeniz alındı');
    expect(f.calls[0].url).toBe('https://api.netgsm.test/sms/rest/v2/send');
    expect(JSON.parse(f.calls[0].init.body as string).encoding).toBe('TR');
  });

  it('kalıcı hata kodunda yeniden denemeden açıklamalı hata fırlatır', async () => {
    const f = fakeFetch({ status: 406, body: { code: '40', description: 'header' } });
    const err = await new NetgsmSmsService(config, f.fn).send('+905321234567', 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SmsDeliveryError);
    expect((err as SmsDeliveryError).code).toBe('40');
    expect((err as Error).message).toContain('Gönderici başlığı');
    expect(f.calls).toHaveLength(1);
  });

  it('sistem hatasında bir kez yeniden dener', async () => {
    const f = fakeFetch({ body: { code: '100' } }, { body: { code: '00', jobid: '9' } });
    await new NetgsmSmsService(config, f.fn).send('+905321234567', 'x');
    expect(f.calls).toHaveLength(2);
  });

  it('ağ hatası iki denemeden sonra yeniden denenebilir hata olarak döner', async () => {
    let n = 0;
    const failing = async () => {
      n++;
      throw new TypeError('fetch failed');
    };
    const err = await new NetgsmSmsService(config, failing).send('+905321234567', 'x').catch((e: unknown) => e);
    expect(n).toBe(2);
    expect(err).toBeInstanceOf(SmsDeliveryError);
    expect((err as SmsDeliveryError).retryable).toBe(true);
  });

  it('numarayı ulusal 10 haneye çevirir', () => {
    expect(toNetgsmNumber('+905321234567')).toBe('5321234567');
    expect(toNetgsmNumber('05321234567')).toBe('5321234567');
  });
});
