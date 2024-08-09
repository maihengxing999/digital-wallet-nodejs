#!/bin/bash

BASE_URL="http://localhost:3000/api"

# Function to make API requests
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local token=$4

    echo "Request: $method ${BASE_URL}${endpoint}"
    echo "Data: $data"

    if [ -n "$token" ]; then
        curl -X $method "${BASE_URL}${endpoint}" \
             -H "Content-Type: application/json" \
             -H "Authorization: Bearer $token" \
             -d "$data"
    else
        curl -X $method "${BASE_URL}${endpoint}" \
             -H "Content-Type: application/json" \
             -d "$data"
    fi

    echo "\n"
}

echo "Starting E-Wallet API Test"

# Step 1: User Registration
echo "--- User Registration ---"
REGISTER_RESPONSE=$(make_request "POST" "/auth/register" '{"email":"test@example.com","password":"password123","firstName":"John","lastName":"Doe"}')
echo "$REGISTER_RESPONSE"

# Extract token (assuming it's in the response)
TOKEN=$(echo "$REGISTER_RESPONSE" | grep -o '"token":"[^"]*' | sed 's/"token":"//g')

if [ -z "$TOKEN" ]; then
    echo "Failed to extract token. Attempting login..."

    # Step 1b: User Login (if registration failed)
    echo "--- User Login ---"
    LOGIN_RESPONSE=$(make_request "POST" "/auth/login" '{"email":"test@example.com","password":"password123"}')
    echo "$LOGIN_RESPONSE"

    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | sed 's/"token":"//g')
fi

if [ -z "$TOKEN" ]; then
    echo "Failed to obtain token. Exiting."
    exit 1
fi

echo "Token obtained: $TOKEN"

# Step 2: Create Wallet
echo "--- Create Wallet ---"
make_request "POST" "/wallet/create" '{"initialBalance":100}' "$TOKEN"

# Step 3: Add Payment Method
echo "--- Add Payment Method ---"
make_request "POST" "/wallet/add-payment-method" '{"paymentMethodId":"pm_card_visa"}' "$TOKEN"

# Step 4: Create Payment Intent
echo "--- Create Payment Intent ---"
PAYMENT_INTENT_RESPONSE=$(make_request "POST" "/wallet/create-payment-intent" '{"amount":50}' "$TOKEN")
echo "$PAYMENT_INTENT_RESPONSE"

# Extract paymentIntentId (adjust this based on your actual response format)
PAYMENT_INTENT_ID=$(echo "$PAYMENT_INTENT_RESPONSE" | grep -o '"paymentIntentId":"[^"]*' | sed 's/"paymentIntentId":"//g')

if [ -z "$PAYMENT_INTENT_ID" ]; then
    echo "Failed to extract paymentIntentId. Exiting."
    exit 1
fi

# Step 5: Confirm Payment Intent
echo "--- Confirm Payment Intent ---"
make_request "POST" "/wallet/confirm-payment-intent" "{\"paymentIntentId\":\"$PAYMENT_INTENT_ID\"}" "$TOKEN"


# Step 6: Check Balance
echo "--- Check Balance ---"
BALANCE_RESPONSE=$(make_request "GET" "/wallet/balance" "" "$TOKEN")
CURRENT_BALANCE=$(echo "$BALANCE_RESPONSE" | grep -o '"balance":[0-9]*' | sed 's/"balance"://g')
echo "Current balance: $CURRENT_BALANCE"

# Step 7: Withdraw Funds
echo "--- Withdraw Funds ---"
if [ -n "$CURRENT_BALANCE" ] && [ "$CURRENT_BALANCE" -gt 0 ]; then
    WITHDRAW_AMOUNT=$((CURRENT_BALANCE / 2))
    echo "Attempting to withdraw $WITHDRAW_AMOUNT"
    if make_request "POST" "/wallet/withdraw" "{\"amount\":$WITHDRAW_AMOUNT}" "$TOKEN"; then
        echo "Withdrawal successful"
    else
        echo "Withdrawal failed. Skipping further tests that depend on this operation."
    fi
else
    echo "Insufficient balance for withdrawal. Skipping withdrawal test."
fi

# Step 8: Create Second User and Transfer Funds
echo "--- Create Second User and Transfer Funds ---"
SECOND_USER_RESPONSE=$(make_request "POST" "/auth/register" '{"email":"test2@example.com","password":"password123","firstName":"Jane","lastName":"Doe"}')
echo "Second User Response: $SECOND_USER_RESPONSE"

SECOND_USER_ID=$(echo "$SECOND_USER_RESPONSE" | grep -o '"id":"[^"]*' | sed 's/"id":"//g')

if [ -n "$SECOND_USER_ID" ]; then
    echo "Second user created with ID: $SECOND_USER_ID"
    echo "Attempting to transfer funds..."
    make_request "POST" "/wallet/transfer" "{\"toUserId\":\"$SECOND_USER_ID\",\"amount\":10}" "$TOKEN"
else
    echo "Failed to extract second user ID. Second user creation might have failed or user might already exist."
    echo "Attempting to login as second user..."
    SECOND_USER_LOGIN=$(make_request "POST" "/auth/login" '{"email":"test2@example.com","password":"password123"}')
    SECOND_USER_ID=$(echo "$SECOND_USER_LOGIN" | grep -o '"id":"[^"]*' | sed 's/"id":"//g')

    if [ -n "$SECOND_USER_ID" ]; then
        echo "Second user logged in with ID: $SECOND_USER_ID"
        echo "Attempting to transfer funds..."
        make_request "POST" "/wallet/transfer" "{\"toUserId\":\"$SECOND_USER_ID\",\"amount\":10}" "$TOKEN"
    else
        echo "Failed to login as second user. Skipping transfer test."
    fi
fi


# Step 9: View Transactions
echo "--- View Transactions ---"
make_request "GET" "/wallet/transactions" "" "$TOKEN"

echo "Test completed."
