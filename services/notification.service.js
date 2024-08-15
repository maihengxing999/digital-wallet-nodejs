const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger');
const User = require('../models/user.model');
const fs = require('fs').promises;
const Handlebars = require('handlebars');
const path = require('path');

class NotificationService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.emailHost,
      port: config.emailPort,
      auth: {
        user: config.emailUsername,
        pass: config.emailPassword
      }
    });
    this.templates = {};
    this.loadEmailTemplates();
  }

  async loadEmailTemplates() {
    try {
      const templateDir = path.join(__dirname, '../templates');
      const baseTemplate = await fs.readFile(path.join(templateDir, 'base-email-template.html'), 'utf-8');
      this.baseTemplate = Handlebars.compile(baseTemplate);

      const templateFiles = ['verification', 'login', 'deposit'];
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
    } catch (error) {
      logger.error('Error in notifyEmailVerification:', error);
      throw new Error(`Failed to send verification email: ${error.message}`);
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
            secureAccountLink: '' //TODO: add link here
          }
        );
      } catch (error) {
        logger.error('Error in notifyLogin:', error);
        // We don't throw here to prevent login process from failing due to notification error
      }
    }

  async notifyDeposit(userId, amount) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      await this.sendEmail(
        user.email,
        'Deposit Successful',
        `Hello ${user.firstName}, a deposit of $${amount} has been successfully added to your wallet.`
      );
    } catch (error) {
      logger.error('Error in notifyDeposit:', error);
      throw new Error(`Failed to send deposit notification: ${error.message}`);
    }
  }

  async notifyTransfer(fromUserId, toUserId, amount) {
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
          `Hello ${fromUser.firstName}, you have successfully sent $${amount} to ${toUser.email}.`
        ),
        this.sendEmail(
          toUser.email,
          'Transfer Received',
          `Hello ${toUser.firstName}, you have received $${amount} from ${fromUser.email}.`
        )
      ]);
    } catch (error) {
      logger.error('Error in notifyTransfer:', error);
      throw new Error(`Failed to send transfer notifications: ${error.message}`);
    }
  }

  async notifyWithdrawal(userId, amount) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      await this.sendEmail(
        user.email,
        'Withdrawal Processed',
        `Hello ${user.firstName}, a withdrawal of $${amount} has been processed from your wallet.`
      );
    } catch (error) {
      logger.error('Error in notifyWithdrawal:', error);
      throw new Error(`Failed to send withdrawal notification: ${error.message}`);
    }
  }

  async notifyWalletCreation(email, initialBalance) {
    try {
      await this.sendEmail(
        email,
        'Wallet Created Successfully',
        `Congratulations! Your new wallet has been created with an initial balance of $${initialBalance}.`
      );
    } catch (error) {
      logger.error('Error in notifyWalletCreation:', error);
      throw new Error(`Failed to send wallet creation notification: ${error.message}`);
    }
  }

  async notifyQRPayment(payerId, recipientId, amount) {
    try {
      const [payer, recipient] = await Promise.all([
        User.findById(payerId),
        User.findById(recipientId)
      ]);

      if (!payer || !recipient) throw new Error('One or both users not found');

      await Promise.all([
        this.sendEmail(
          payer.email,
          'QR Payment Sent',
          `Hello ${payer.firstName}, you have successfully sent $${amount} via QR payment to ${recipient.email}.`
        ),
        this.sendEmail(
          recipient.email,
          'QR Payment Received',
          `Hello ${recipient.firstName}, you have received $${amount} via QR payment from ${payer.email}.`
        )
      ]);
    } catch (error) {
      logger.error('Error in notifyQRPayment:', error);
      throw new Error(`Failed to send QR payment notifications: ${error.message}`);
    }
  }

  // Add more notification methods for other events as needed
}

module.exports = new NotificationService();
