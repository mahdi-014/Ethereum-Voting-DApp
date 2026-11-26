#!/usr/bin/env bash
set -e
source /home/thefool/.nvm/nvm.sh

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
echo "4. FRONTEND PRODUCTION BUILD"
echo "=========================================="
cd frontend
npm run build
cd ..

echo "=========================================="
echo "5. VERIFY CONTRACT ON LOCALHOST"
echo "=========================================="
npx hardhat run --network localhost scripts/verify-voting.ts

echo "=========================================="
echo "ALL VERIFICATIONS COMPLETED SUCCESSFULLY!"
echo "=========================================="
