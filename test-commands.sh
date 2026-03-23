#!/bin/bash
# ──────────────────────────────────────────
# A2A Swap CLI — 수동 테스트 커맨드
# TEST_CASES.md 기반
#
# 사전 조건:
#   1. 서버 실행 중 (API_URL 설정)
#   2. .env에 PRIVATE_KEY_TEST1, PRIVATE_KEY_TEST2 설정
#   3. 테스트 토큰 민팅 완료 (USDC, WETH)
#   4. npx ts-node src/cli/index.ts 또는 빌드 후 airfi-swap 사용
#
# 사용법: 각 섹션을 하나씩 복사하여 실행
# ──────────────────────────────────────────

CLI="npx ts-node src/cli/index.ts"

# ══════════════════════════════════════════
# TC-01: 정상 Settle (USDC ↔ WETH)
# ══════════════════════════════════════════

# 1) seller(test1)가 오퍼 생성
$CLI propose --sell "100 USDC" --buy "0.05 ETH" --wallet test1 --duration 300

# 2) buyer(test2)가 오퍼 수락 (offer ID를 위에서 확인)
$CLI accept 1 --wallet test2

# 3) operator가 정산할 때까지 대기 (서버 로그 확인)
# 4) 검증
$CLI trust 0x<seller_address>
$CLI trust 0x<buyer_address>
$CLI history --wallet test1

# ══════════════════════════════════════════
# TC-03: Open 상태 Seller Cancel (페널티 없음)
# ══════════════════════════════════════════

# 1) 오퍼 생성
$CLI propose --sell "50 USDC" --buy "0.02 ETH" --wallet test1 --duration 300

# 2) 바로 취소
$CLI cancel <offer-id> --wallet test1

# 3) 검증: penalty=false, reputation 변동 없음
$CLI trust 0x<seller_address>

# ══════════════════════════════════════════
# TC-04: Deployed 후 Cancel (페널티)
# ══════════════════════════════════════════

# 1) 오퍼 생성 + accept
$CLI propose --sell "50 USDC" --buy "0.02 ETH" --wallet test1 --duration 300
$CLI accept <offer-id> --wallet test2

# 2) seller가 취소 (deployed 상태)
$CLI cancel <offer-id> --wallet test1

# 3) 검증: penalty=true, scoreDelta=-2
$CLI trust 0x<seller_address>

# ══════════════════════════════════════════
# TC-06: Buyer Cancel (페널티)
# ══════════════════════════════════════════

# 1) 오퍼 생성 + accept
$CLI propose --sell "50 USDC" --buy "0.02 ETH" --wallet test1 --duration 300
$CLI accept <offer-id> --wallet test2

# 2) buyer가 취소
$CLI cancel <offer-id> --wallet test2

# 3) 검증: buyer cancellations +1
$CLI trust 0x<buyer_address>

# ══════════════════════════════════════════
# TC-09: Min Score 미달 Buyer 거부
# ══════════════════════════════════════════

# 1) min-score 10으로 오퍼 생성
$CLI propose --sell "50 USDC" --buy "0.02 ETH" --wallet test1 --min-score 10 --duration 300

# 2) score 0인 buyer가 accept 시도 → 거부되어야 함
$CLI accept <offer-id> --wallet test2

# ══════════════════════════════════════════
# TC-11: RFQ 정상 플로우
# ══════════════════════════════════════════

# 1) RFQ 생성 (test1이 ETH를 원하고 USDC를 줄 수 있음)
$CLI rfq --need "0.05 ETH" --budget "100 USDC" --wallet test1 --duration 300

# 2) quoter(test2)가 견적 제출
$CLI quote <rfq-id> --offer "0.05 ETH" --wallet test2

# 3) 견적 목록 확인
$CLI quotes <rfq-id>

# 4) seller가 견적 선택
$CLI pick <rfq-id> <quote-id> --wallet test1

# 5) 검증
$CLI list

# ══════════════════════════════════════════
# TC-16/17: Reputation 조회
# ══════════════════════════════════════════

# 거래 이력 있는 지갑
$CLI trust 0x<seller_address>

# 신규 지갑 (모든 값 0)
$CLI trust 0x0000000000000000000000000000000000000001

# ══════════════════════════════════════════
# ETH Wrap/Unwrap 테스트
# ══════════════════════════════════════════

# ETH를 매도 토큰으로 사용 (자동 wrap)
$CLI propose --sell "0.01 ETH" --buy "20 USDC" --wallet test1 --duration 300

# 수동 unwrap
$CLI unwrap --wallet test1

# 특정 금액만 unwrap
$CLI unwrap --wallet test1 --amount 0.005

# ══════════════════════════════════════════
# 에러 케이스
# ══════════════════════════════════════════

# 잘못된 금액
$CLI propose --sell "0 USDC" --buy "0.5 ETH" --wallet test1
# → "Invalid sell amount: 0"

# 잘못된 형식
$CLI propose --sell "USDC" --buy "ETH" --wallet test1
# → "Invalid format"

# 존재하지 않는 오퍼
$CLI accept 99999 --wallet test1
# → "Offer not found"

# 이미 settled된 오퍼 cancel
$CLI cancel <settled-offer-id> --wallet test1
# → "Cannot cancel offer in status: settled"
