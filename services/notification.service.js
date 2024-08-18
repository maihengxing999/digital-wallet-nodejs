const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger');
const User = require('../models/user.model');
const fs = require('fs').promises;
const Handlebars = require('handlebars');
const path = require('path');

class NotificationService {
  constructor() {
    this.transporter = this.createTransporter();
    this.templates = {};
    this.loadEmailTemplates();
    Handlebars.registerHelper('eq', function(a, b) {
      return a === b;
    });
  }

  createTransporter() {
    const useMailHog = process.env.USE_MAILHOG === 'true';

    if (useMailHog) {
      logger.info('Using MailHog for email testing');
      return nodemailer.createTransport({
        host: 'mailhog', // Docker service name
        port: 1025,
        ignoreTLS: true
      });
    } else {
      logger.info('Using configured SMTP server for emails');
      return nodemailer.createTransport({
        host: config.emailHost,
        port: config.emailPort,
        auth: {
          user: config.emailUsername,
          pass: config.emailPassword
        }
      });
    }
  }


  async loadEmailTemplates() {
    try {
      const templateDir = path.join(__dirname, '../templates');
      const baseTemplate = await fs.readFile(path.join(templateDir, 'base-email-template.html'), 'utf-8');
      this.baseTemplate = Handlebars.compile(baseTemplate);

      const templateFiles = [
        'verification',
        'login',
        'deposit',
        'kyc-verification',
        'qr-payment',
        'transfer',
        'withdrawal',
        'wallet-creation',
        'payment-method-added'
      ];

      for (const file of templateFiles) {
        const templatePath = path.join(templateDir, `${file}-email-template.html`);
        const templateContent = await fs.readFile(templatePath, 'utf-8');
        this.templates[file] = Handlebars.compile(templateContent);
      }
      logger.info('Email templates loaded successfully');
      logger.debug('Loaded templates:', Object.keys(this.templates));
    } catch (error) {
      logger.error('Error loading email templates:', error);
      throw new Error(`Failed to load email templates: ${error.message}`);
    }
  }

  async sendEmail(to, subject, templateName, context) {
    try {
      if (!this.templates[templateName]) {
        logger.error(`Template '${templateName}' not found. Available templates:`, Object.keys(this.templates));
        throw new Error(`Email template '${templateName}' not found`);
      }

      logger.debug(`Rendering template: ${templateName}`);
      logger.debug('Template context:', context);

      const template = this.templates[templateName];
      const content = template(context);
      const html = this.baseTemplate({ content, subject, ...context });

      const mailOptions = {
        from: 'Your E-Wallet <noreply@coderstudio.co>',
        to,
        subject,
        html
      };

      logger.debug('Mail options:', mailOptions);

      await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${to} using template ${templateName}`);

      // If using MailHog, log additional information for testing
      if (process.env.USE_MAILHOG === 'true') {
        logger.info(`MailHog Web Interface: http://localhost:8025`);
        logger.info(`Check MailHog to view the sent email.`);
      }
    } catch (error) {
      logger.error('Error sending email:', error);
      logger.error('Template name:', templateName);
      logger.error('Context:', context);
      throw new Error(`Failed to send email notification: ${error.message}`);
    }
  }

  async sendSMS(phoneNumber, message) {
    try {
      // Implement SMS sending logic here
      // You might want to use a service like Twilio for this
      logger.info(`SMS sent to ${phoneNumber}: ${message}`);
    } catch (error) {
      logger.error('Error sending SMS:', error);
      throw new Error(`Failed to send SMS notification: ${error.message}`);
    }
  }

  async sendPushNotification(userId, title, body) {
    try {
      // Implement push notification logic here
      // You might want to use a service like Firebase Cloud Messaging for this
      logger.info(`Push notification sent to user ${userId}: ${title} - ${body}`);
    } catch (error) {
      logger.error('Error sending push notification:', error);
      throw new Error(`Failed to send push notification: ${error.message}`);
    }
  }

  async notifyEmailVerification(user, verificationLink) {
    try {
      await this.sendEmail(
        user.email,
        'Verify Your E-Wallet Email',
        'verification',
        {
          firstName: user.firstName,
          verificationLink
        }
      );
      logger.info(`Verification email sent successfully to ${user.email}`);
      return true;
    } catch (error) {
      logger.error(`Error sending verification email to ${user.email}:`, error);
      return false;
    }
  }

  async notifyLogin(user, loginTime, loginLocation) {
    try {
      await this.sendEmail(
        user.email,
        'New Login to Your E-Wallet Account',
        'login',
        {
          firstName: user.firstName,
          loginTime,
          loginLocation,
          secureAccountLink: `${config.appUrl}/secure-account` // Update with actual link
        }
      );
    } catch (error) {
      logger.error('Error in notifyLogin:', error);
      // We don't throw here to prevent login process from failing due to notification error
    }
  }

  async notifyDeposit(userId, amount, transactionId) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      await this.sendEmail(
        user.email,
        'Deposit Successful',
        'deposit',
        {
          firstName: user.firstName,
          amount,
          transactionId,
          transactionDate: new Date().toLocaleString(),
          viewBalanceLink: `${config.appUrl}/wallet/balance`
        }
      );
    } catch (error) {
      logger.error('Error in notifyDeposit:', error);
      throw new Error(`Failed to send deposit notification: ${error.message}`);
    }
  }

  async notifyKYCUpdate(userId, kycStatus, rejectionReason = null) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      await this.sendEmail(
        user.email,
        'KYC Verification Update',
        'kyc-verification',
        {
          firstName: user.firstName,
          kycStatus,
          rejectionReason,
          accountLink: `${config.appUrl}/account`,
          resubmitLink: `${config.appUrl}/kyc/resubmit`
        }
      );
    } catch (error) {
      logger.error('Error in notifyKYCUpdate:', error);
      throw new Error(`Failed to send KYC update notification: ${error.message}`);
    }
  }

  async notifyQRPayment(payerId, recipientId, amount, transactionId, paymentStatus) {
    try {
      logger.info(`Notifying QR payment. Payer: ${payerId}, Recipient: ${recipientId}`);

      const [payer, recipient] = await Promise.all([
        User.findById(payerId),
        User.findById(recipientId)
      ]);

      if (!payer) {
        logger.error(`Payer not found. ID: ${payerId}`);
        throw new Error(`Payer not found. ID: ${payerId}`);
      }
      if (!recipient) {
        logger.error(`Recipient not found. ID: ${recipientId}`);
        throw new Error(`Recipient not found. ID: ${recipientId}`);
      }

      await Promise.all([
        this.sendEmail(
          payer.email,
          'QR Payment Sent',
          'qr-payment',
          {
            firstName: payer.firstName,
            paymentStatus: 'sent',
            amount,
            transactionId,
            transactionDate: new Date().toLocaleString(),
            transactionDetailsLink: `${config.appUrl}/transactions/${transactionId}`
          }
        ),
        this.sendEmail(
          recipient.email,
          'QR Payment Received',
          'qr-payment',
          {
            firstName: recipient.firstName,
            paymentStatus: 'received',
            amount,
            transactionId,
            transactionDate: new Date().toLocaleString(),
            transactionDetailsLink: `${config.appUrl}/transactions/${transactionId}`
          }
        )
      ]);

      logger.info(`QR payment notifications sent successfully for transaction ${transactionId}`);
    } catch (error) {
      logger.error('Error in notifyQRPayment:', error);
      throw new Error(`Failed to send QR payment notifications: ${error.message}`);
    }
  }

  async notifyTransfer(fromUserId, toUserId, amount, transactionId, fromBalance, toBalance) {
    try {
      const [fromUser, toUser] = await Promise.all([
        User.findById(fromUserId),
        User.findById(toUserId)
      ]);

      if (!fromUser || !toUser) throw new Error('One or both users not found');

      await Promise.all([
        this.sendEmail(
          fromUser.email,
          'Transfer Sent',
          'transfer',
          {
            firstName: fromUser.firstName,
            transferStatus: 'sent',
            amount,
            otherPartyName: toUser.email,
            transactionId,
            transactionDate: new Date().toLocaleString(),
            transactionDetailsLink: `${config.appUrl}/transactions/${transactionId}`,
            newBalance: fromBalance
          }
        ),
        this.sendEmail(
          toUser.email,
          'Transfer Received',
          'transfer',
          {
            firstName: toUser.firstName,
            transferStatus: 'received',
            amount,
            otherPartyName: fromUser.email,
            transactionId,
            transactionDate: new Date().toLocaleString(),
            transactionDetailsLink: `${config.appUrl}/transactions/${transactionId}`,
            newBalance: toBalance
          }
        )
      ]);
    } catch (error) {
      logger.error('Error in notifyTransfer:', error);
      throw new Error(`Failed to send transfer notifications: ${error.message}`);
    }
  }

  async notifyWithdrawal(userId, amount, transactionId, withdrawalStatus, withdrawalMethod, failureReason = null) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      await this.sendEmail(
        user.email,
        'Withdrawal Update',
        'withdrawal',
        {
          firstName: user.firstName,
          amount,
          withdrawalStatus,
          transactionId,
          transactionDate: new Date().toLocaleString(),
          withdrawalMethod,
          failureReason,
          transactionDetailsLink: `${config.appUrl}/transactions/${transactionId}`,
          newBalance: user.wallet.balance - amount // Assuming balance is updated before notification for successful withdrawals
        }
      );
    } catch (error) {
      logger.error('Error in notifyWithdrawal:', error);
      throw new Error(`Failed to send withdrawal notification: ${error.message}`);
    }
  }

  async notifyWalletCreation(userId, initialBalance) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      await this.sendEmail(
        user.email,
        'Wallet Created Successfully',
        'wallet-creation',
        {
          firstName: user.firstName,
          initialBalance,
          walletLink: `${config.appUrl}/wallet`
        }
      );
      logger.info(`Wallet creation notification sent to user ${userId}`);
    } catch (error) {
      logger.error('Error in notifyWalletCreation:', error);
      // We don't throw here to prevent wallet creation from failing due to notification error
    }
  }

  async notifyPaymentMethodAdded(userId, last4, cardBrand) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      await this.sendEmail(
        user.email,
        'New Payment Method Added',
        'payment-method-added',
        {
          firstName: user.firstName,
          last4: last4,
          cardBrand: cardBrand,
          managePaymentMethodsLink: `${config.appUrl}/wallet/payment-methods`
        }
      );
      logger.info(`Payment method added notification sent to user ${userId}`);
    } catch (error) {
      logger.error('Error in notifyPaymentMethodAdded:', error);
      // We don't throw here to prevent the payment method addition from failing due to notification error
    }
  }

  // Add more notification methods for other events as needed
}

module.exports = new NotificationService();
