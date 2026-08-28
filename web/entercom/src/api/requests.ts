import { normalizeData } from './normalize';
import { apiClient } from './axios';

export interface RequestItem {
  id: string;
  public_id?: string;
  title?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  description?: string;
  service_type?: string;
  address?: string;
  category?: string;
  priority?: string;
  location?: any;
  next_states?: {action: string, target: string}[];
  payment_id?: string;
  order_id?: string;
}

export interface QuoteItem {
  id: string;
  version: number;
  amount: string;
  status: string;
  notes?: string;
}

export const requestsApi = {
  list: async () => {
    const { data } = await apiClient.get<{data: RequestItem[]}>('/requests/?limit=1000');
    return normalizeData(data); // Standard pagination response uses data.data
  },
  get: async (id: string) => {
    const { data } = await apiClient.get<{data: RequestItem}>(`/requests/${id}/`);
    return normalizeData(data);
  },
  create: async (payload: any) => {
    const { data } = await apiClient.post<{data: RequestItem}>('/requests/', payload);
    return normalizeData(data);
  },
  update: async (id: string, payload: any) => {
    const { data } = await apiClient.patch<{data: RequestItem}>(`/requests/${id}/`, payload);
    return normalizeData(data);
  },
  submit: async (id: string) => {
    const { data } = await apiClient.post<RequestItem>(`/requests/${id}/submit/`);
    return normalizeData(data);
  },
  pickup: async (id: string) => {
    const { data } = await apiClient.post<RequestItem>(`/requests/${id}/pick-up/`);
    return normalizeData(data);
  },
  triage: async (id: string, action: 'needs_quote' | 'require_payment' | 'assign_directly' | 'close_direct') => {
    const { data } = await apiClient.post<RequestItem>(`/requests/${id}/triage/`, { action });
    return normalizeData(data);
  },
  cancel: async (id: string, reason_code: string) => {
    const { data } = await apiClient.post<RequestItem>(`/requests/${id}/cancel/`, { reason_code });
    return normalizeData(data);
  },
  assign: async (id: string, technician_id: string) => {
    const { data } = await apiClient.post<RequestItem>(`/requests/${id}/assign/`, { technician_id });
    return normalizeData(data);
  },
  accept: async (id: string) => {
    const { data } = await apiClient.post<RequestItem>(`/requests/${id}/accept/`);
    return normalizeData(data);
  },
  decline: async (id: string, reason_code: string) => {
    const { data } = await apiClient.post<RequestItem>(`/requests/${id}/decline/`, { reason_code });
    return normalizeData(data);
  },
  escalate: async (id: string, reason: string) => {
    const { data } = await apiClient.post<RequestItem>(`/requests/${id}/escalate/`, { reason });
    return normalizeData(data);
  },
  submit_verification: async (id: string, payload: { photos: string[], notes?: string, checklist?: any, customer_ack?: boolean }) => {
    const { data } = await apiClient.post(`/requests/${id}/verify/`, payload);
    return normalizeData(data);
  },
  review_verification: async (id: string, payload: { action: 'approve'|'reject'|'override', notes?: string }) => {
    const { data } = await apiClient.post(`/requests/${id}/review/`, payload);
    return normalizeData(data);
  },
  timeline: async (id: string) => {
    const { data } = await apiClient.get<{data: any[]}>(`/requests/${id}/timeline/`);
    return normalizeData(data);
  },
  resolveEscalation: async (id: string, target_state: string, resolution_type = 'MANUAL') => {
    const { data } = await apiClient.post<RequestItem>(`/requests/${id}/resolve-escalation/`, { target_state, resolution_type });
    return normalizeData(data);
  },
  close_direct: async (id: string) => {
    // close_direct is a triage action routed through POST /triage/
    const { data } = await apiClient.post<RequestItem>(`/requests/${id}/triage/`, { action: 'close_direct' });
    return normalizeData(data);
  },
  quotes: {
    list: async (requestId: string) => {
      const { data } = await apiClient.get<any>(`/requests/${requestId}/quotes/`);
      return normalizeData(data);
    },
    create: async (requestId: string, payload: { amount: number, notes?: string }) => {
      const { data } = await apiClient.post<QuoteItem>(`/requests/${requestId}/quotes/`, payload);
      return normalizeData(data);
    },
    action: async (requestId: string, action: 'approve' | 'reject' | 'revise', reason?: string) => {
      const { data } = await apiClient.post(`/requests/${requestId}/quote/customer-action/`, { action, reason });
      return normalizeData(data);
    }
  },
  inspection: {
    get: async (requestId: string) => {
      const { data } = await apiClient.get(`/requests/${requestId}/inspection/`);
      return normalizeData(data);
    },
    update: async (requestId: string, payload: any) => {
      const { data } = await apiClient.patch(`/requests/${requestId}/inspection/`, payload);
      return normalizeData(data);
    },
    uploadPhoto: async (requestId: string, file: File, description?: string) => {
      const formData = new FormData();
      formData.append('file', file);
      if (description) formData.append('description', description);
      const { data } = await apiClient.post(`/requests/${requestId}/inspection/photo/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return normalizeData(data);
    }
  }
};
