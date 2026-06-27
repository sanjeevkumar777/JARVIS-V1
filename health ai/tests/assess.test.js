const request = require('supertest');
const app = require('../server');

describe('POST /assess', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns mapped response on success', async () => {
    // Mock Infermedica diagnosis and triage responses
    const diagnosisResp = { conditions: [{ id: 'c1', name: 'Flu', probability: 0.72 }] };
    const triageResp = { recommendation: 'Seek primary care', severity: 'yellow' };

    let call = 0;
    global.fetch = jest.fn().mockImplementation(async (url, opts) => {
      call++;
      if (url.endsWith('/diagnosis')) {
        return { ok: true, status: 200, text: async () => JSON.stringify(diagnosisResp) };
      }
      if (url.endsWith('/triage')) {
        return { ok: true, status: 200, text: async () => JSON.stringify(triageResp) };
      }
      return { ok: false, status: 404, text: async () => '' };
    });

    const payload = { sex: 'female', age: 30, evidence: [{ id: 's_1', choice_id: 'present' }] };
    const res = await request(app).post('/assess').send(payload).set('Accept', 'application/json');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('conditions');
    expect(Array.isArray(res.body.conditions)).toBe(true);
    expect(res.body.conditions[0].id).toBe('c1');
    expect(res.body).toHaveProperty('triage');
    expect(res.body.confidence).toHaveProperty('level');
    expect(res.body.reason).toMatch(/Flu/);
  });

  test('returns 400 on invalid input', async () => {
    const res = await request(app).post('/assess').send({}).set('Accept', 'application/json');
    expect(res.statusCode).toBe(400);
  });

  test('returns 502 when Infermedica errors', async () => {
    global.fetch = jest.fn().mockImplementation(async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ error: 'bad' }) }));
    const payload = { sex: 'male', age: 40, evidence: [{ id: 's_2' }] };
    const res = await request(app).post('/assess').send(payload).set('Accept', 'application/json');
    expect(res.statusCode).toBe(502);
    expect(res.body).toHaveProperty('error', 'infermedica_down');
  });
});
