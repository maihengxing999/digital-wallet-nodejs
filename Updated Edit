# Digital Wallet API

This project implements a robust and secure digital wallet API with features including user authentication, wallet management, payment processing, and KYC (Know Your Customer) verification.

## Table of Contents

- [Digital Wallet API](#digital-wallet-api)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Tech Stack](#tech-stack)
  - [Project Structure](#project-structure)
  - [API Endpoints](#api-endpoints)
    - [Authentication](#authentication)
    - [Wallet Operations](#wallet-operations)
    - [KYC Operations](#kyc-operations)
    - [Stripe Operations](#stripe-operations)
  - [Middleware](#middleware)
  - [Services](#services)
  - [Models](#models)
  - [Configuration](#configuration)
  - [Getting Started](#getting-started)

## Features

- User registration and authentication
- Wallet creation and management
- Deposit and withdrawal functionality
- Fund transfers between users
- Payment processing with Stripe integration
- KYC verification process
- QR code generation for payments
- Admin user management
- Comprehensive error handling and logging

## Tech Stack

- Node.js
- Express.js
- MongoDB with Mongoose ORM
- Stripe for payment processing
- MinIO for document storage
- JWT for authentication
- Joi for input validation
- Winston for logging

## Project Structure

The project follows a modular structure:

- `controllers/`: Handle request processing and response sending
- `middleware/`: Custom middleware for authentication, error handling, etc.
- `models/`: Mongoose models for database schemas
- `routes/`: Express routes for different API endpoints
- `services/`: Business logic and third-party service integrations
- `utils/`: Utility functions and helpers

## API Endpoints

### Authentication
- POST `/api/auth/register`: Register a new user
- POST `/api/auth/login`: Log in a user
- POST `/api/auth/create-admin`: Create a new admin user (admin only)
- PUT `/api/auth/make-admin/:userId`: Promote a user to admin (admin only)
- PUT `/api/auth/remove-admin/:userId`: Remove admin privileges (admin only)
- POST `/api/auth/setup-admin`: Initial admin setup

### Wallet Operations
- POST `/api/wallet/create`: Create a new wallet
- GET `/api/wallet/balance`: Get wallet balance
- POST `/api/wallet/deposit`: Deposit funds
- POST `/api/wallet/withdraw`: Withdraw funds
- POST `/api/wallet/transfer`: Transfer funds to another user
- GET `/api/wallet/transactions`: Get transaction history
- POST `/api/wallet/create-payment-intent`: Create a Stripe payment intent
- POST `/api/wallet/confirm-payment-intent`: Confirm a Stripe payment intent
- POST `/api/wallet/generate-qr`: Generate a QR code for payment
- POST `/api/wallet/initiate-qr-payment`: Initiate a payment from a QR code
- POST `/api/wallet/confirm-qr-payment`: Confirm a QR code payment

### KYC Operations
- POST `/api/kyc/initiate`: Initiate KYC process
- POST `/api/kyc/upload-document`: Upload KYC document
- GET `/api/kyc/status`: Get KYC status
- PUT `/api/kyc/update-status`: Update KYC status (admin only)

### Stripe Operations
- POST `/api/stripe/create-payment-method`: Create a new payment method
- GET `/api/stripe/payment-methods`: Get user's payment methods

## Middleware

- `auth.middleware.js`: JWT authentication and admin authorization
- `error.middleware.js`: Centralized error handling
- `file-upload.middleware.js`: File upload handling with MinIO integration
- `logging.middleware.js`: Request logging
- `validation.middleware.js`: Input validation using Joi schemas

## Services

- `kyc.service.js`: Handles KYC verification process
- `stripe.service.js`: Integrates with Stripe for payment processing
- `wallet.service.js`: Manages wallet operations and transactions

## Models

- `kyc-verification.model.js`: KYC verification schema
- `transaction.model.js`: Transaction schema
- `user.model.js`: User schema with embedded wallet
- `wallet.model.js`: Wallet schema

## Configuration

Environment variables are used for configuration, including:

- MongoDB connection string
- JWT secret
- Stripe API key
- MinIO configuration
- Admin setup key

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables in a `.env` file
4. Run the server: `npm start`

For detailed API documentation, refer to the Postman collection included in the project.
