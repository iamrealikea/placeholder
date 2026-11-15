const { store, COLLECTIONS } = require('../store/jsonStore');
const UserModel = require('./user.model');
const EventModel = require('./event.model');
const CategoryModel = require('./category.model');
const SeatModel = require('./seat.model');
const BookingModel = require('./booking.model');
const PaymentModel = require('./payment.model');
const TicketModel = require('./ticket.model');
const PromotionModel = require('./promotion.model');
const NotificationModel = require('./notification.model');
const SupportModel = require('./support.model');

module.exports = {
  store,
  COLLECTIONS,
  UserModel,
  EventModel,
  CategoryModel,
  SeatModel,
  BookingModel,
  PaymentModel,
  TicketModel,
  PromotionModel,
  NotificationModel,
  SupportModel
};
