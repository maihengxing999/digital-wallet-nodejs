#!/bin/bash

# E-Wallet API Test Script
# This script tests the main functionalities of the E-Wallet API

# Set the base URL for the API
BASE_URL="http://localhost:3000/api"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Function to check if a command was successful
check_status() {
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: $1${NC}"
        exit 1
    fi
}

# Function to extract value from JSON response
extract_json_value() {
    # echo $1 | grep -o '"'$2'":"[^"]*' | sed 's/"'$2'":"//g'
    echo "$1" | jq -r --arg key "$2" '.[$key]'
}

# Function to check for Stripe API key error
check_stripe_error() {
    if echo "$1" | grep -q "You did not provide an API key"; then
        echo -e "${RED}Error: Stripe API key is not set properly on the server${NC}"
        echo "Please ensure STRIPE_SECRET_KEY is set in the server's environment variables"
        exit 1
    fi
}

echo "Starting E-Wallet API Test"

# Test 1: User Registration
echo -e "\n${GREEN}--- Test 1: User Registration ---${NC}"
REGISTER_RESPONSE=$(curl -s -X POST ${BASE_URL}/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123","firstName":"John","lastName":"Doe"}' \
     -w "\nStatus: %{http_code}")
echo "Request:"
echo "POST ${BASE_URL}/auth/register"
echo '{"email":"test@example.com","password":"password123","firstName":"John","lastName":"Doe"}'
echo "Response:"
echo "$REGISTER_RESPONSE"
check_stripe_error "$REGISTER_RESPONSE"
check_status "User registration failed"

# Test 2: User Login
echo -e "\n${GREEN}--- Test 2: User Login ---${NC}"
LOGIN_RESPONSE=$(curl -s -X POST ${BASE_URL}/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}' \
     -w "\nStatus: %{http_code}")
echo "Request:"
echo "POST ${BASE_URL}/auth/login"
echo '{"email":"test@example.com","password":"password123"}'
echo "Response:"
echo "$LOGIN_RESPONSE"
check_status "User login failed"

# Extract token from registration response
json=$LOGIN_RESPONSE
key='token'
# TOKEN=$(extract_json_value "$json" 'token')
# USER_ID=$(extract_json_value "$json" 'user.id')
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | sed 's/"token":"//g')
USER_ID=$(echo "$REGISTER_RESPONSE" | grep -o '"id":"[^"]*' | sed 's/"id":"//g')

echo "Extracted Token: $TOKEN"
echo "Extracted UserId: $USER_ID"

exit
# Test 3: Create Wallet
echo -e "\n${GREEN}--- Test 3: Create Wallet ---${NC}"
CREATE_WALLET_RESPONSE=$(curl -s -X POST ${BASE_URL}/wallet/create \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"initialBalance":100}' \
     -w "\nStatus: %{http_code}")
echo "Request:"
echo "POST ${BASE_URL}/wallet/create"
echo "Authorization: Bearer $TOKEN"
echo "{\"userId\":\"$USER_ID\",\"initialBalance\":100}"
echo "Response:"
echo "$CREATE_WALLET_RESPONSE"
check_stripe_error "$CREATE_WALLET_RESPONSE"
check_status "Wallet creation failed"


# Test 4: Deposit to Wallet
echo -e "\n${GREEN}--- Test 4: Deposit to Wallet ---${NC}"
DEPOSIT_RESPONSE=$(curl -s -X POST ${BASE_URL}/wallet/deposit \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"amount":50,"paymentMethodId":"pm_card_visa"}' \
     -w "\nStatus: %{http_code}")
echo "Request:"
echo "POST ${BASE_URL}/wallet/deposit"
echo "Authorization: Bearer $TOKEN"
echo '{"amount":50,"paymentMethodId":"pm_card_visa"}'
echo "Response:"
echo "$DEPOSIT_RESPONSE"
check_stripe_error "$DEPOSIT_RESPONSE"
check_status "Deposit failed"

# Test 5: Check Balance
echo -e "\n${GREEN}--- Test 5: Check Balance ---${NC}"
BALANCE_RESPONSE=$(curl -s -X GET ${BASE_URL}/wallet/balance \
     -H "Authorization: Bearer $TOKEN" \
     -w "\nStatus: %{http_code}")
echo "Request:"
echo "GET ${BASE_URL}/wallet/balance"
echo "Authorization: Bearer $TOKEN"
echo "Response:"
echo "$BALANCE_RESPONSE"
check_status "Balance check failed"

echo -e "\n${GREEN}All tests completed successfully!${NC}"
