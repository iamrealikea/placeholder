const { v4: uuidv4 } = require('uuid');
const { store } = require('../store/jsonStore');

class PaymentModel {
  static findAll() {
    return store.getAll('payments');
  }

  static findByUserId(userId) {
    return store.find('payments', (p) => p.userId === userId);
  }

  static findByBookingId(bookingId) {
    return store.findOne('payments', (p) => p.bookingId === bookingId);
  }

  static create({ bookingId, userId, method, amount }) {
    const paymentRecord = {
      id: `pay-${uuidv4().slice(0, 8)}`,
      bookingId,
      userId,
      method,
      amount,
      referenceCode: `TH-${method.slice(0, 2)}-${Date.now()}`,
      status: 'SUCCESS',
      refundAmount: 0,
      paidAt: new Date().toISOString(),
      refundedAt: null
    };
    return store.insert('payments', paymentRecord);
  }

  static markRefunded(bookingId, refundAmount, reason = null) {
    const payment = this.findByBookingId(bookingId);
    if (!payment) return null;
    const updates = {
      status: 'REFUNDED',
      refundAmount,
      refundedAt: new Date().toISOString()
    };
    if (reason) {
      updates.refundReason = reason;
    }
    return store.update('payments', payment.id, updates);
  }
}

module.exports = PaymentModel;
