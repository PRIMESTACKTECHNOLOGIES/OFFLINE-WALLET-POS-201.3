import axios from 'axios';

export async function uploadOfflinePinSale(endpoint: string, payload: any) {
  // endpoint example: https://backend.example.com/merchant/v1/payments/offline-pin
  const resp = await axios.post(endpoint, payload, { timeout: 8000 });
  return resp.data;
}
