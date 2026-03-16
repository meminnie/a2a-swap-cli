# zero-otc v2: CREATE2 Escrow + API Server + Reputation

## Overview

P2P OTC swap platform for AI agents on Base chain.
- **오프체인 매칭** (Supabase) → **CREATE2 per-trade escrow** 배포
- **API 서버** (Fastify + Swagger) — CLI/SDK가 직접 Supabase 접근하지 않음
- **자체 Reputation 시스템** — 0점 시작, 실적 기반
- **Operator가 gasless 배포** — 유저는 토큰 transfer만

## Stack

- **Contracts**: Solidity (Hardhat) — EscrowFactory + TradeEscrow (CREATE2)
- **API Server**: Node.js / Fastify + @fastify/swagger
- **DB**: Supabase (PostgreSQL) — service_role key로 서버에서만 접근
- **CLI**: Commander.js → API 호출로 전환
- **SDK**: ZeroOTC class → API 호출로 전환
- **Chain**: Base Sepolia → Mainnet

## Architecture

```
Seller ──→ API Server ──→ Supabase (offers, reputation)
Buyer  ──→ API Server ──→ Operator EOA (CREATE2 deploy + settle)
                     ──→ Base chain (TradeEscrow contracts)
```

### 전체 플로우

```
1. Seller → POST /offers { sellToken, sellAmount, buyToken, buyAmount, minScore? }
   ← { offerId, escrowAddress (CREATE2 계산), deadline }
   → Seller가 escrowAddress로 sellToken transfer

2. Buyer → GET /offers (seller score 표시, buyer score < minScore면 accept 불가)
   → POST /offers/:id/accept { buyerAddress }

3. Operator (서버): 매칭 감지
   → TradeEscrow 배포 (CREATE2, 우리 gas)
   → Buyer에게 deposit 주소 + deadline 응답

4. Buyer → 컨트랙트에 buyToken transfer

5. Operator (서버): 양쪽 입금 확인
   → settle() 호출 (우리 gas)
   → 수수료 차감 (양쪽 0.1%, 최소 $0.50)
   → reputation +1 양쪽

6. Timeout: Buyer 미입금
   → refund() → Seller 토큰 반환
   → Buyer reputation -3

7. Cancel: 매칭 후 취소
   → 취소한 쪽 reputation -2
   → 상대방 토큰 반환
```

---

## Phase 1: Smart Contracts

### 1-1. TradeEscrow.sol (1회용 per-trade 컨트랙트)
- [ ] 생성자: seller, buyer, sellToken, buyToken, sellAmount, buyAmount, deadline, feeBps, feeRecipient
- [ ] settle(): 양쪽 토큰 도착 확인 → 스왑 실행 → 수수료 차감
- [ ] refund(): 타임아웃 시 각자에게 반환
- [ ] 이벤트: Settled, Refunded, FeeCollected
- [ ] 최소 가스 사용 (minimal logic, no storage overhead)

### 1-2. EscrowFactory.sol (CREATE2 배포)
- [ ] computeAddress(): salt 기반 TradeEscrow 주소 미리 계산
- [ ] deploy(): operator만 호출 가능 (onlyOperator)
- [ ] salt = keccak256(seller, buyer, sellToken, buyToken, sellAmount, buyAmount, nonce)
- [ ] feeBps, feeRecipient 설정 (owner만 변경 가능)
- [ ] nonce 관리 (같은 조건의 거래 구분)

### 1-3. 테스트
- [ ] TradeEscrow 단위 테스트 (settle, refund, fee, timeout)
- [ ] EscrowFactory 테스트 (computeAddress 일치, deploy, operator 권한)
- [ ] CREATE2 주소에 미리 토큰 전송 → 배포 후 settle 시나리오
- [ ] Edge cases: 부족한 금액, 잘못된 토큰, 중복 settle

---

## Phase 2: API Server (Fastify + Swagger)

### 2-1. 프로젝트 셋업
- [ ] server/ 디렉토리 생성 (monorepo 구조)
- [ ] Fastify + TypeScript + @fastify/swagger + @fastify/swagger-ui
- [ ] 환경변수: SUPABASE_SERVICE_ROLE_KEY, OPERATOR_PRIVATE_KEY, RPC_URL 등
- [ ] CORS, rate limiting, error handling 미들웨어

### 2-2. API 엔드포인트
- [ ] POST /offers — offer 생성 (CREATE2 주소 계산 + Supabase 저장)
- [ ] GET /offers — open offer 목록 (seller score 포함)
- [ ] GET /offers/:id — offer 상세 (상태, 주소, score)
- [ ] POST /offers/:id/accept — buyer 수락 (score 검증 + 매칭)
- [ ] POST /offers/:id/cancel — 취소 (매칭 전: free, 매칭 후: -2)
- [ ] GET /reputation/:wallet — 점수 조회
- [ ] GET /offers/:id/status — 거래 상태

### 2-3. Operator 자동화 (서버 내부)
- [ ] 매칭 감지 → CREATE2 배포 (operator EOA)
- [ ] 양쪽 입금 모니터링 (polling or event listener)
- [ ] settle() 자동 호출
- [ ] 타임아웃 감지 → refund() + reputation 페널티
- [ ] 실패 시 retry 로직

---

## Phase 3: DB 스키마 업데이트

### 3-1. offers 테이블 확장
- [ ] computed_escrow_address TEXT
- [ ] nonce BIGINT
- [ ] min_score INTEGER DEFAULT 0
- [ ] status 확장: open → matched → seller_deposited → deployed → settled / cancelled / expired

### 3-2. reputation 테이블 (신규)
- [ ] wallet TEXT PRIMARY KEY
- [ ] successful_swaps INTEGER DEFAULT 0
- [ ] failed_swaps INTEGER DEFAULT 0
- [ ] cancellations INTEGER DEFAULT 0
- [ ] score INTEGER DEFAULT 0 (= successful_swaps - failed_swaps*3 - cancellations*2)
- [ ] updated_at TIMESTAMPTZ
- [ ] RLS: 읽기만 public, 쓰기는 service_role만

### 3-3. RLS 강화
- [ ] offers: 읽기 public, 쓰기는 service_role만
- [ ] reputation: 읽기 public, 쓰기는 service_role만
- [ ] anon key는 읽기 전용 (또는 제거)

---

## Phase 4: CLI 리팩터링

### 4-1. API 클라이언트 모듈
- [ ] src/api.ts — Fastify 서버 호출 (fetch 기반)
- [ ] 기존 Supabase 직접 호출 제거

### 4-2. 명령어 변경
- [ ] propose → POST /offers + 토큰 transfer (온체인 offer 생성 제거)
- [ ] accept → POST /offers/:id/accept + 토큰 transfer
- [ ] list → GET /offers (score 컬럼 표시)
- [ ] watch → WebSocket or polling /offers/:id/status
- [ ] history → GET /offers?wallet=...&status=settled
- [ ] trust → GET /reputation/:wallet (기존 ERC-8004 제거)
- [ ] cancel (신규) → POST /offers/:id/cancel

### 4-3. Score 관련
- [ ] propose에 --min-score 옵션 추가
- [ ] list에서 seller score 표시
- [ ] accept 전 buyer에게 seller score 표시

---

## Phase 5: SDK 리팩터링

- [ ] ZeroOTC class → API 서버 호출로 전환
- [ ] Supabase 직접 의존 제거
- [ ] 기존 인터페이스 유지 (breaking change 최소화)

---

## Phase 6: 레거시 정리

- [ ] 기존 Escrow.sol — deprecated 표시, 제거하지 않음
- [ ] 기존 Supabase anon key 사용 코드 제거
- [ ] ERC-8004 관련 코드 제거 (trust.ts placeholder 등)

---

## 수수료 정책

- 양쪽 0.1% (10 BPS)
- 최소 수수료 $0.50 (oracle 가격 기준)
- feeRecipient: operator EOA (또는 별도 지갑)
- owner가 feeBps, feeRecipient 변경 가능

## Reputation 정책

- 시작 점수: 0
- 스왑 완료: +1 (양쪽)
- Buyer 미입금 타임아웃: -3 (buyer)
- 매칭 후 취소: -2 (취소한 쪽)
- score = successful_swaps - (failed_swaps * 3) - (cancellations * 2)
- 초반에는 표시만, 나중에 --min-score 필터로 gate

## Key Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| CREATE2 주소로 잘못된 토큰 전송 | High | 서버에서 토큰 주소 + 금액 검증 후 매칭 |
| Operator key 유출 | Critical | HSM / KMS, 최소 권한, 모니터링 |
| 가스비 > 수수료 (소액 거래) | Medium | 최소 수수료 $0.50 |
| Sybil (지갑 생성 남용) | Low | 0점 시작 = 자연 방어, 추후 anti-spam deposit |
| API 서버 다운타임 | High | 헬스체크, 자동 재시작, 매칭 상태 복구 로직 |
