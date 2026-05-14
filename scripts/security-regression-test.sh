#!/bin/bash
# ============================================
# Security Regression Test Script
# R-006: Post-deploy smoke tests
# ============================================
#
# Usage: bash scripts/security-regression-test.sh [BASE_URL]
# Default: https://hallofood.santosjayaabadi.co.id
#

BASE_URL="${1:-https://hallofood.santosjayaabadi.co.id}"
PASS=0
FAIL=0

echo "🔐 Security Regression Tests"
echo "   Target: $BASE_URL"
echo "   Date:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================"
echo ""

# Helper function
check() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"

    if echo "$actual" | grep -qi "$expected"; then
        echo "  ✅ PASS: $test_name"
        PASS=$((PASS + 1))
    else
        echo "  ❌ FAIL: $test_name"
        echo "     Expected to find: $expected"
        echo "     Got: $actual"
        FAIL=$((FAIL + 1))
    fi
}

check_absent() {
    local test_name="$1"
    local unwanted="$2"
    local actual="$3"

    if echo "$actual" | grep -qi "$unwanted"; then
        echo "  ❌ FAIL: $test_name"
        echo "     Should NOT contain: $unwanted"
        echo "     Got: $actual"
        FAIL=$((FAIL + 1))
    else
        echo "  ✅ PASS: $test_name"
        PASS=$((PASS + 1))
    fi
}

check_status() {
    local test_name="$1"
    local expected_code="$2"
    local actual_code="$3"

    if [ "$actual_code" = "$expected_code" ]; then
        echo "  ✅ PASS: $test_name (HTTP $actual_code)"
        PASS=$((PASS + 1))
    else
        echo "  ❌ FAIL: $test_name"
        echo "     Expected HTTP $expected_code, got HTTP $actual_code"
        FAIL=$((FAIL + 1))
    fi
}

# ─── F-001: Security Headers on SPA Root ───
echo "📋 F-001: Security headers on SPA root HTML"
SPA_HEADERS=$(curl -sI "$BASE_URL/" 2>/dev/null)
check "HSTS on /" "strict-transport-security" "$SPA_HEADERS"
check "CSP on /" "content-security-policy" "$SPA_HEADERS"
check "X-Frame-Options on /" "x-frame-options" "$SPA_HEADERS"
check "X-Content-Type-Options on /" "x-content-type-options" "$SPA_HEADERS"
check "Referrer-Policy on /" "referrer-policy" "$SPA_HEADERS"
check "Permissions-Policy on /" "permissions-policy" "$SPA_HEADERS"
echo ""

# ─── F-001: Security Headers on API ───
echo "📋 F-001: Security headers on API"
API_HEADERS=$(curl -sI "$BASE_URL/api/health" 2>/dev/null)
check "HSTS on /api/health" "strict-transport-security" "$API_HEADERS"
check "X-Content-Type-Options on /api/health" "x-content-type-options" "$API_HEADERS"
echo ""

# ─── F-004: CORS origin check ───
echo "📋 F-004: CORS origin validation"
CORS_RESP=$(curl -sI -H "Origin: https://hallofood.santosjayaabadi.co.id" "$BASE_URL/api/health" 2>/dev/null)
check "CORS allows canonical origin" "access-control-allow-origin" "$CORS_RESP"
echo ""

# ─── F-005: Technology disclosure ───
echo "📋 F-005: Technology disclosure suppression"
check_absent "No X-Powered-By on /" "x-powered-by" "$SPA_HEADERS"
check_absent "No X-Powered-By on API" "x-powered-by" "$API_HEADERS"
check_absent "No X-Served-By on /" "x-served-by" "$SPA_HEADERS"
echo ""

# ─── R-006a: mustChangePassword enforcement ───
echo "📋 R-006a: mustChangePassword=true blocks admin endpoints"
echo "  ℹ️  This test requires a valid token for a mustChangePassword=true user."
echo "  ℹ️  Set MCP_TOKEN env variable to run this test."
if [ -n "$MCP_TOKEN" ]; then
    MCP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $MCP_TOKEN" "$BASE_URL/api/users" 2>/dev/null)
    check_status "GET /api/users with mustChangePassword token → 403" "403" "$MCP_STATUS"

    MCP_SETTINGS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $MCP_TOKEN" "$BASE_URL/api/settings" 2>/dev/null)
    check_status "GET /api/settings with mustChangePassword token → 403" "403" "$MCP_SETTINGS"

    MCP_ME=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $MCP_TOKEN" "$BASE_URL/api/auth/me" 2>/dev/null)
    check_status "GET /api/auth/me with mustChangePassword token → 200 (allowed)" "200" "$MCP_ME"
else
    echo "  ⏭️  Skipped (MCP_TOKEN not set)"
fi
echo ""

# ─── R-006b: SSE unauthenticated access ───
echo "📋 R-006b: SSE requires valid ticket"
SSE_NO_TICKET=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/sse" 2>/dev/null)
check_status "GET /api/sse without ticket → 401" "401" "$SSE_NO_TICKET"

SSE_BAD_TICKET=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/sse?ticket=invalidtoken123" 2>/dev/null)
check_status "GET /api/sse with invalid ticket → 401" "401" "$SSE_BAD_TICKET"
echo ""

# ─── F-003: refreshToken not in web login response ───
echo "📋 F-003: refreshToken not exposed in web login JSON"
echo "  ℹ️  Set TEST_USER and TEST_PASS env variables to run this test."
if [ -n "$TEST_USER" ] && [ -n "$TEST_PASS" ]; then
    LOGIN_BODY=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -H "User-Agent: Mozilla/5.0" \
        -d "{\"externalId\":\"$TEST_USER\",\"password\":\"$TEST_PASS\"}" 2>/dev/null)
    check_absent "No refreshToken in web login JSON" "refreshToken" "$LOGIN_BODY"
else
    echo "  ⏭️  Skipped (TEST_USER/TEST_PASS not set)"
fi
echo ""

# ─── Summary ───
echo "============================================"
TOTAL=$((PASS + FAIL))
echo "Results: $PASS/$TOTAL passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
    echo "⚠️  Some tests FAILED — review output above"
    exit 1
else
    echo "✅ All tests PASSED"
    exit 0
fi
