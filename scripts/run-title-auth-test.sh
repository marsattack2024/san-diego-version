#!/bin/bash

# Run Title Generation Authentication Test
# This script runs the title generation authentication test with proper logging

echo "Running Title Generation Authentication Test..."
echo "================================================"

# Set environment to test
export NODE_ENV=test

# Run only the title generation auth test with verbose output
npx vitest run tests/unit/api/title-generation-auth.test.ts --reporter verbose

# Check the result
if [ $? -eq 0 ]; then
  echo "✅ Title Generation Authentication Test Passed"
else
  echo "❌ Title Generation Authentication Test Failed"
  exit 1
fi

echo "================================================"
echo "Test completed successfully" 