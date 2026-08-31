import { normalizeData } from './normalize';
import { apiClient } from './axios';

export interface PaymentItem {
  id: string;
  order_id: string;
  request_id?: string;
  status: string;
  amount: string;
  currency: string;
  authorization_url?: string;
  created_at: string;
}

export const paymentsApi = {
  list: async () => {
    const { data } = await apiClient.get<PaymentItem[]>('/payments/');
    return normalizeData(data);
  },
  get: async (id: string) => {
    const { data } = await apiClient.get<PaymentItem>(`/payments/${id}/`);
    return normalizeData(data);
  },
  initializeQuotePayment: async (payload: { quote_id: string, payment_plan: string, callback_url?: string }) => {
    const { data } = await apiClient.post<PaymentItem>('/payments/quote/initialize/', payload);
    return normalizeData(data);
  },
  initialize: async (payload: { order_id: string, callback_url?: string }) => {
    const { data } = await apiClient.post<PaymentItem>('/payments/initialize/', payload);
    return normalizeData(data);
  },
  cancel: async (id: string, reason?: string) => {
    const { data } = await apiClient.post<PaymentItem>(`/payments/${id}/cancel/`, { reason });
    return normalizeData(data);
  },
  refund: async (id: string, reason?: string) => {
    const { data } = await apiClient.post<PaymentItem>(`/payments/${id}/refund/`, { reason });
    return normalizeData(data);
  },
  escalate: async (id: string, reason: string) => {
    const { data } = await apiClient.post<PaymentItem>(`/payments/${id}/escalate/`, { reason });
    return normalizeData(data);
  },
  simulateWebhook: async (reference: string) => {
    const { data } = await apiClient.post('/payments/webhooks/paystack/', {
      event: 'charge.success',
      data: { reference }
    });
    return normalizeData(data);
  }
};
