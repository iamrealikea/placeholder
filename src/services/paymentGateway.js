const { PaymentModel } = require('../models');

const VALID_METHODS = ['PROMPTPAY', 'CREDIT_CARD', 'DEBIT_CARD', 'KBANK', 'KRUNGTHAI', 'TRUEMONEY'];

function gatewayError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Validates method-specific gateway details (when supplied) and records payment.
 */
function processPayment({ bookingId, userId, method, amount, paymentDetails }) {
  if (!VALID_METHODS.includes(method)) {
    throw gatewayError(`Invalid payment method. Allowed: ${VALID_METHODS.join(', ')}`);
  }

  if (paymentDetails && typeof paymentDetails === 'object') {
    if (paymentDetails.simulateFailure === true) {
      throw gatewayError('Payment declined by gateway simulator.');
    }

    if (method === 'CREDIT_CARD' || method === 'DEBIT_CARD') {
      if (paymentDetails.cardNumber !== undefined) {
        const digits = typeof paymentDetails.cardNumber === 'string'
          ? paymentDetails.cardNumber.replace(/\s+/g, '')
          : '';
        if (!/^\d{13,19}$/.test(digits)) {
          throw gatewayError('Invalid card number. Enter 13 to 19 digits.');
        }
      }

      if (paymentDetails.expiry !== undefined) {
        const expiry = typeof paymentDetails.expiry === 'string' ? paymentDetails.expiry.trim() : '';
        if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
          throw gatewayError('Invalid card expiry date. Use MM/YY format.');
        }
      }

      if (paymentDetails.cvv !== undefined) {
        const cvv = typeof paymentDetails.cvv === 'string' ? paymentDetails.cvv.trim() : '';
        if (!/^\d{3,4}$/.test(cvv)) {
          throw gatewayError('Invalid security code (CVV). Enter 3 or 4 digits.');
        }
      }

      if (paymentDetails.cardHolder !== undefined) {
        const holder = typeof paymentDetails.cardHolder === 'string' ? paymentDetails.cardHolder.trim() : '';
        if (!holder) {
          throw gatewayError('Cardholder name is required.');
        }
      }
    } else if (method === 'KBANK' || method === 'KRUNGTHAI' || method === 'TRUEMONEY') {
      if (paymentDetails.phone !== undefined) {
        const cleaned = typeof paymentDetails.phone === 'string'
          ? paymentDetails.phone.replace(/[\s-]+/g, '')
          : '';
        if (!/^\d{9,13}$/.test(cleaned)) {
          throw gatewayError('Invalid registered phone or citizen ID.');
        }
      }
    }
  }

  return PaymentModel.create({
    bookingId,
    userId,
    method,
    amount
  });
}

module.exports = {
  VALID_METHODS,
  processPayment
};
