#!/usr/bin/env bash
set -e
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
fi

echo "=========================================="
echo "1. HARDHAT COMPILE"
echo "=========================================="
npx hardhat compile

echo "=========================================="
echo "2. HARDHAT UNIT TESTS"
echo "=========================================="
npx hardhat test

echo "=========================================="
echo "3. TYPESCRIPT TYPECHECK"
echo "=========================================="
npx tsc --noEmit

echo "=========================================="
echo "4. FRONTEND UI & INTEGRATION TESTS"
echo "=========================================="
npm --prefix frontend test

echo "=========================================="
echo "5. FRONTEND PRODUCTION BUILD"
echo "=========================================="
npm --prefix frontend run build

echo "=========================================="
echo "6. VERIFY CONTRACT ON LOCALHOST"
echo "=========================================="
npx hardhat run --network localhost scripts/verify-voting.ts

echo "=========================================="
echo "ALL VERIFICATIONS COMPLETED SUCCESSFULLY!"
echo "=========================================="
