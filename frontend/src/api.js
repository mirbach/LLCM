import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const company = {
  get: () => api.get('/company'),
  update: (data) => api.put('/company', data),
  uploadLogo: (file) => {
    const form = new FormData();
    form.append('logo', file);
    return api.post('/company/logo', form);
  },
  deleteLogo: () => api.delete('/company/logo'),
};

export const customers = {
  list: () => api.get('/customers'),
  get: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
};

export const invoices = {
  list: (params) => api.get('/invoices', { params }),
  get: (id) => api.get(`/invoices/${id}`),
  create: (data) => api.post('/invoices', data),
  update: (id, data) => api.put(`/invoices/${id}`, data),
  updateStatus: (id, status) => api.patch(`/invoices/${id}/status`, { status }),
  delete: (id) => api.delete(`/invoices/${id}`),
  pdfUrl: (id) => `/api/invoices/${id}/pdf`,
  pdfFromHtml: (id, html) => api.post(`/invoices/${id}/pdf-from-html`, { html }, { responseType: 'arraybuffer' }),
  send: (id) => api.post(`/invoices/${id}/send`),
};

export const backup = {
  download: () => api.get('/backup', { responseType: 'blob' }),
  restore: (data) => api.post('/backup', data),
};

export const bankAccount = {
  list: () => api.get('/bank-accounts'),
  create: (data) => api.post('/bank-accounts', data),
  update: (id, data) => api.put(`/bank-accounts/${id}`, data),
  delete: (id) => api.delete(`/bank-accounts/${id}`),
  getWiseConfig: () => api.get('/bank-accounts/wise/config'),
  saveWiseConfig: (data) => api.put('/bank-accounts/wise/config', data),
  testWise: () => api.post('/bank-accounts/wise/test'),
  getSavedTransactions: (params) => api.get('/bank-accounts/wise/transactions/saved', { params }),
  getTransactions: (params) => api.get('/bank-accounts/wise/transactions', { params }),
};

export const textBlocks = {
  list: () => api.get('/text-blocks'),
  create: (data) => api.post('/text-blocks', data),
  update: (id, data) => api.put(`/text-blocks/${id}`, data),
  setDefault: (id) => api.patch(`/text-blocks/${id}/default`),
  delete: (id) => api.delete(`/text-blocks/${id}`),
};
