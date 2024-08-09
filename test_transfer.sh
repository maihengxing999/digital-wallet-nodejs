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
        curl -s -X $method "${BASE_URL}${endpoint}" \
             -H "Content-Type: application/json" \
             -H "Authorization: Bearer $token" \
             -d "$data"
    else
        curl -s -X $method "${BASE_URL}${endpoint}" \
             -H "Content-Type: application/json" \
             -d "$data"
    fi

    echo "\n"
}

# Function to register or login a user
register_or_login_user() {
    local email=$1
    local password=$2
    local firstName=$3
    local lastName=$4

    echo "Attempting to register user: $email"
    RESPONSE=$(make_request "POST" "/auth/register" "{\"email\":\"$email\",\"password\":\"$password\",\"firstName\":\"$firstName\",\"lastName\":\"$lastName\"}")

    if echo "$RESPONSE" | grep -q "error"; then
        echo "User might already exist. Attempting login."
        RESPONSE=$(make_request "POST" "/auth/login" "{\"email\":\"$email\",\"password\":\"$password\"}")
    fi

    echo "$RESPONSE"
}

# Function to ensure a user has a wallet
ensure_wallet() {
    local token=$1
    local initialBalance=$2

    WALLET_RESPONSE=$(make_request "GET" "/wallet/balance" "" "$token")
    if echo "$WALLET_RESPONSE" | grep -q "error"; then
        echo "Creating wallet with initial balance: $initialBalance"
        make_request "POST" "/wallet/create" "{\"initialBalance\":$initialBalance}" "$token"
    else
        echo "Wallet already exists"
    fi
}

echo "Starting E-Wallet API Test"

# Step 1: Register or Login First User
echo "--- Register or Login First User ---"
FIRST_USER_RESPONSE=$(register_or_login_user "test@example.com" "password123" "John" "Doe")
echo "$FIRST_USER_RESPONSE"

TOKEN=$(echo "$FIRST_USER_RESPONSE" | grep -o '"token":"[^"]*' | sed 's/"token":"//g')
FIRST_USER_ID=$(echo "$FIRST_USER_RESPONSE" | grep -o '"id":"[^"]*' | sed 's/"id":"//g')

if [ -z "$TOKEN" ] || [ -z "$FIRST_USER_ID" ]; then
    echo "Failed to obtain token or user ID for first user. Exiting."
    exit 1
fi

echo "First user processed. Token: $TOKEN, ID: $FIRST_USER_ID"

# Ensure first user has a wallet
ensure_wallet "$TOKEN" 100

# Step 2: Register or Login Second User
echo "--- Register or Login Second User ---"
SECOND_USER_RESPONSE=$(register_or_login_user "test2@example.com" "password123" "Jane" "Doe")
echo "$SECOND_USER_RESPONSE"

SECOND_USER_TOKEN=$(echo "$SECOND_USER_RESPONSE" | grep -o '"token":"[^"]*' | sed 's/"token":"//g')
SECOND_USER_ID=$(echo "$SECOND_USER_RESPONSE" | grep -o '"id":"[^"]*' | sed 's/"id":"//g')

if [ -z "$SECOND_USER_TOKEN" ] || [ -z "$SECOND_USER_ID" ]; then
    echo "Failed to obtain token or user ID for second user. Exiting."
    exit 1
fi

echo "Second user processed. Token: $SECOND_USER_TOKEN, ID: $SECOND_USER_ID"

# Ensure second user has a wallet
ensure_wallet "$SECOND_USER_TOKEN" 0

# Step 3: Transfer Funds
echo "--- Transfer Funds ---"
TRANSFER_RESPONSE=$(make_request "POST" "/wallet/transfer" "{\"toUserId\":\"$SECOND_USER_ID\",\"amount\":10}" "$TOKEN")
echo "Transfer Response: $TRANSFER_RESPONSE"

# Step 4: Check Balance for Both Users
echo "--- Check Balance (First User) ---"
make_request "GET" "/wallet/balance" "" "$TOKEN"

echo "--- Check Balance (Second User) ---"
make_request "GET" "/wallet/balance" "" "$SECOND_USER_TOKEN"

# Step 5: View Transactions (First User)
echo "--- View Transactions (First User) ---"
make_request "GET" "/wallet/transactions" "" "$TOKEN"

echo "Test completed."
