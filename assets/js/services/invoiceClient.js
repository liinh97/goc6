export function getInvoiceClient(FBModule) {
  const c = window.FBClient || {};

  const client = {
    // auth
    signInAnonymouslyIfNeeded: c.signInAnonymouslyIfNeeded || FBModule?.signInAnonymouslyIfNeeded,

    // list
    listInvoicesByQuery: c.listInvoicesByQuery || FBModule?.listInvoicesByQuery,

    // crud
    saveInvoice: c.saveInvoice || FBModule?.saveInvoice,
    getInvoice: c.getInvoice || FBModule?.getInvoice,
    updateInvoice: c.updateInvoice || FBModule?.updateInvoice,
    updateInvoiceStatus: c.updateInvoiceStatus || FBModule?.updateInvoiceStatus,
  };

  // hard check các hàm bắt buộc cho invoice/stat
  const required = ['listInvoicesByQuery', 'getInvoice', 'updateInvoice', 'updateInvoiceStatus', 'saveInvoice'];
  const missing = required.filter(k => typeof client[k] !== 'function');

  if (missing.length) {
    console.warn('Invoice client missing:', missing);
    // không throw ngay để bạn debug nhẹ nhàng, nhưng module gọi sẽ throw khi cần
  }

  return client;
}

