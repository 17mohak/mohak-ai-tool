#!/bin/bash
# AUTH END-TO-END TEST SCRIPT

echo "=========================================="
echo "AUTH SYSTEM END-TO-END TEST"
echo "=========================================="
echo ""

# Test 1: Health check
echo "1. Testing backend health..."
HEALTH=$(curl -s http://localhost:8000/health)
echo "   Response: $HEALTH"
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "   [OK] Backend is running"
else
    echo "   [FAIL] Backend not responding"
    exit 1
fi

echo ""

# Test 2: Login
echo "2. Testing login..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@atlasuniversity.edu.in","password":"password"}')

echo "   Response: $LOGIN_RESPONSE"

# Extract token
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo "   [OK] Login successful, token received"
    echo "   Token: ${TOKEN:0:20}..."
else
    echo "   [FAIL] Login failed - no token"
    exit 1
fi

echo ""

# Test 3: Debug endpoint - check headers
echo "3. Testing /me-debug (checking headers)..."
DEBUG_RESPONSE=$(curl -s -X GET http://localhost:8000/api/auth/me-debug \
  -H "Authorization: Bearer $TOKEN")

echo "   Response: $DEBUG_RESPONSE"

if echo "$DEBUG_RESPONSE" | grep -q '"token_received":true'; then
    echo "   [OK] Token is being received correctly"
else
    echo "   [WARN] Token not received - checking raw response"
fi

echo ""

# Test 4: Real /me endpoint
echo "4. Testing /api/auth/me..."
ME_RESPONSE=$(curl -s -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN")

echo "   Response: $ME_RESPONSE"

if echo "$ME_RESPONSE" | grep -q '"id"'; then
    echo "   [OK] /me endpoint working - user data received"
    EMAIL=$(echo "$ME_RESPONSE" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
    echo "   User: $EMAIL"
else
    echo "   [FAIL] /me endpoint failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "ALL TESTS PASSED!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - Backend is running"
echo "  - Login works and returns token"
echo "  - Token is sent correctly"
echo "  - /me endpoint returns user data"
echo ""
echo "The auth system is FULLY WORKING!"
