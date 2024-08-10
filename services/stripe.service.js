const stripe = require('stripe')(require('../config').stripeSecretKey);
class StripeService {
    static async createCustomer(email) {
      return await stripe.customers.create({ email });
    }

    /* THIS NEED CONFIRMATION ON
    
    static async createPaymentIntent(amount, currency, customerId) {
      return await stripe.paymentIntents.create({
        amount: amount * 100, // Convert to cents
        currency,
        customer: customerId,
        payment_method_types: ['card'],
      });
    }

    static async confirmPaymentIntent(paymentIntentId) {
      return await stripe.paymentIntents.confirm(paymentIntentId);
    }

    static async attachPaymentMethodToCustomer(paymentMethodId, customerId) {
        return await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      }

      static async createPayout(amount, customerId) {
        // Note: In a real-world scenario, you'd typically use a connected account for payouts
        // This is a simplified version for demonstration purposes
        return await stripe.payouts.create({
          amount: amount * 100, // Convert to cents
          currency: 'usd',
          method: 'instant',
        }, {
          stripeAccount: customerId, // This assumes the customer ID can be used as a connected account ID, which is not typically the case
        });
      }*/

    /* THIS IS AUTO CONFIRM */
    static async attachPaymentMethodToCustomer(paymentMethodId, customerId) {
        return await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      }

    static async createPaymentIntent(amount, currency, customerId) {
        return await stripe.paymentIntents.create({
            amount: amount * 100, // convert to cents
            currency,
            customer: customerId,
            setup_future_usage: 'off_session',
        });
    }

    static async confirmPaymentIntent(paymentIntentId, paymentMethodId) {
        return await stripe.paymentIntents.confirm(paymentIntentId, {
            payment_method: paymentMethodId,
        });
    }
      /* */


  }

  module.exports = StripeService;
