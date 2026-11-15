const { store } = require('../store/jsonStore');

class PromotionModel {
  static findActiveByCode(promoCode) {
    if (!promoCode) return null;
    const target = String(promoCode).toUpperCase();
    return store.findOne(
      'promotions',
      (p) => p.code && p.code.toUpperCase() === target && p.active
    );
  }
}

module.exports = PromotionModel;
