const stripe = require('stripe')(require('../config').stripeSecretKey);
const logger = require('../utils/logger');
class StripeService {
  static async createCustomer(email) {
    try {
      const customer = await stripe.customers.create({ email });
      logger.info(`Created Stripe customer for email: ${email}`);
      return customer;
    } catch (error) {
      logger.error(`Error creating Stripe customer: ${error.message}`);
      throw new Error(`Failed to create Stripe customer: ${error.message}`);
    }
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
    try {
      const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
      logger.info(`Attached payment method ${paymentMethodId} to customer ${customerId}`);
      return paymentMethod;
    } catch (error) {
      logger.error(`Error attaching payment method: ${error.message}`);
      throw new Error(`Failed to attach payment method: ${error.message}`);
    }
  }

  static async createPaymentIntent(
    amount,
    currency,
    customerId,
    paymentMethodId
  ) {
    logger.info(
      `Creating PaymentIntent: amount=${amount}, currency=${currency}, customerId=${customerId}, paymentMethodId=${paymentMethodId}`
    );

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        customer: customerId,
        payment_method: paymentMethodId,
        setup_future_usage: "off_session",
      });

      logger.info(`PaymentIntent created: ${JSON.stringify(paymentIntent)}`);
      return paymentIntent;
    } catch (error) {
      logger.error(`Error creating PaymentIntent: ${error.message}`);
      throw error;
    }
  }

  static async confirmPaymentIntent(paymentIntentId, paymentMethodId) {
    try {
      const confirmedPaymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
      });
      logger.info(`Confirmed PaymentIntent: ${paymentIntentId}`);
      return confirmedPaymentIntent;
    } catch (error) {
      logger.error(`Error confirming PaymentIntent: ${error.message}`);
      throw new Error(`Failed to confirm PaymentIntent: ${error.message}`);
    }
  }

  static async createPayout(amount, customerId) {
    try {
      // Note: In a real-world scenario, you'd typically use a connected account for payouts
      // This is a simplified version for demonstration purposes
      const payout = await stripe.payouts.create({
        amount: amount * 100, // Convert to cents
        currency: 'usd',
        method: 'instant',
      }, {
        stripeAccount: customerId, // This assumes the customer ID can be used as a connected account ID, which is not typically the case
      });
      logger.info(`Created payout for customer ${customerId}: ${JSON.stringify(payout)}`);
      return payout;
    } catch (error) {
      logger.error(`Error creating payout: ${error.message}`);
      throw new Error(`Failed to create payout: ${error.message}`);
    }
  }

  static async listPaymentMethods(customerId) {
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });
      logger.debug(`Retrieved ${paymentMethods.data.length} payment methods for customer ${customerId}`);
      return paymentMethods;
    } catch (error) {
      logger.error('Error listing payment methods:', error);
      throw new Error(`Failed to list payment methods: ${error.message}`);
    }
  }

  static async retrievePaymentMethod(paymentMethodId) {
    try {
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      logger.debug(`Retrieved payment method ${paymentMethodId}`);
      return paymentMethod;
    } catch (error) {
      logger.error(`Error retrieving payment method ${paymentMethodId}:`, error);
      throw new Error(`Failed to retrieve payment method: ${error.message}`);
    }
  }

  static async attachPaymentMethodToCustomer(paymentMethodId, customerId) {
    try {
      // First, retrieve the payment method to check its current status
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      logger.debug(`Retrieved payment method before attachment: ${JSON.stringify(paymentMethod)}`);

      if (paymentMethod.customer === customerId) {
        logger.info(`Payment method ${paymentMethodId} is already attached to customer ${customerId}`);
        return paymentMethod;
      }

      if (paymentMethod.customer) {
        // If the payment method is attached to another customer, detach it first
        await stripe.paymentMethods.detach(paymentMethodId);
        logger.info(`Detached payment method ${paymentMethodId} from previous customer`);
      }

      // Attach the payment method to the new customer
      const attachedPaymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      logger.info(`Payment method ${paymentMethodId} attached to customer ${customerId}`);
      logger.debug(`Attached payment method response: ${JSON.stringify(attachedPaymentMethod)}`);
      return attachedPaymentMethod;
    } catch (error) {
      logger.error(`Error in attachPaymentMethodToCustomer: ${error.message}`);
      logger.error(`Error details: ${JSON.stringify(error)}`);
      throw new Error(`Failed to attach payment method: ${error.message}`);
    }
  }

  static async detachPaymentMethod(paymentMethodId) {
    try {
      const detachedPaymentMethod = await stripe.paymentMethods.detach(paymentMethodId);
      logger.info(`Detached payment method ${paymentMethodId}`);
      return detachedPaymentMethod;
    } catch (error) {
      logger.error(`Error detaching payment method ${paymentMethodId}:`, error);
      throw new Error(`Failed to detach payment method: ${error.message}`);
    }
  }

}

module.exports = StripeService;
