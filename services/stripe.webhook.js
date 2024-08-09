const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class StripeService {
  static async createCustomer(email) {
    return await stripe.customers.create({ email });
  }

  static async createPaymentMethod(type, card) {
    return await stripe.paymentMethods.create({ type, card });
  }

  static async attachPaymentMethodToCustomer(paymentMethodId, customerId) {
    return await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  }

  static async listCustomerPaymentMethods(customerId) {
    return await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
  }

  static async createPaymentIntent(amount, currency, customerId, paymentMethodId) {
    return await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
    });
  }
}

module.exports = StripeService;
