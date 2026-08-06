const axios = require('axios');

async function run() {
  const url = process.env.BACKEND_URL || 'http://localhost:3000/merchant/v1/payments/offline-pin';
  const payload = {
    merchantId: 'MRC-1001',
    terminalId: 'T-TEST-001',
    amountMinor: 1250,
    currency: 'USD',
    panMasked: '4111****1111',
    stan: '123456',
    rrn: '000000123456',
    authCode: 'OFFLINE-AUTH-TEST',
    pinVerified: true,
    emvData: { atc: '0001', '9F26': 'ABCDEF' },
    tlvRaw: '9F2608ABCDEF9F36020001'
  };

  try {
    const resp = await axios.post(url, payload, { timeout: 5000 });
    console.log('Response status', resp.status);
    console.log(resp.data);
  } catch (err) {
    console.error('Request failed', err?.response?.data || err.message || err);
  }
}

if (require.main === module) run();
