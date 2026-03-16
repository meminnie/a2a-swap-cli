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

## Phase 1: Smart Contracts ✅

### 1-1. TradeEscrow.sol (1회용 per-trade 컨트랙트)
- [x] 생성자: seller, buyer, sellToken, buyToken, sellAmount, buyAmount, deadline, feeBps, feeRecipient
- [x] settle(): 양쪽 토큰 도착 확인 → 스왑 실행 → 수수료 차감
- [x] refund(): 타임아웃 시 각자에게 반환
- [x] 이벤트: Settled, Refunded, FeeCollected
- [x] 최소 가스 사용 (minimal logic, no storage overhead)

### 1-2. EscrowFactory.sol (CREATE2 배포)
- [x] computeAddress(): salt 기반 TradeEscrow 주소 미리 계산
- [x] deploy(): operator만 호출 가능 (onlyOperator)
- [x] salt = keccak256(seller, buyer, sellToken, buyToken, sellAmount, buyAmount, nonce)
- [x] feeBps, feeRecipient 설정 (owner만 변경 가능)
- [x] nonce 관리 (같은 조건의 거래 구분)

### 1-3. 테스트
- [x] TradeEscrow 단위 테스트 (settle, refund, fee, timeout)
- [x] EscrowFactory 테스트 (computeAddress 일치, deploy, operator 권한)
- [x] CREATE2 주소에 미리 토큰 전송 → 배포 후 settle 시나리오
- [x] Edge cases: 부족한 금액, 잘못된 토큰, 중복 settle

---

## Phase 2: API Server (Fastify + Swagger) ✅

### 2-1. 프로젝트 셋업
- [x] server/ 디렉토리 생성 (monorepo 구조)
- [x] Fastify + TypeScript + @fastify/swagger + @fastify/swagger-ui
- [x] 환경변수: SUPABASE_SERVICE_ROLE_KEY, OPERATOR_PRIVATE_KEY, RPC_URL 등
- [x] CORS, rate limiting, error handling 미들웨어

### 2-2. API 엔드포인트
- [x] POST /offers — offer 생성 (CREATE2 주소 계산 + Supabase 저장)
- [x] GET /offers — open offer 목록 (seller score 포함)
- [x] GET /offers/:id — offer 상세 (상태, 주소, score)
- [x] POST /offers/:id/accept — buyer 수락 (score 검증 + 매칭)
- [x] POST /offers/:id/cancel — 취소 (매칭 전: free, 매칭 후: -2)
- [x] GET /reputation/:wallet — 점수 조회
- [x] POST /rfq — RFQ 생성
- [x] POST /rfq/:id/quote — quote 제출
- [x] GET /rfq/:id/quotes — quote 목록
- [x] POST /rfq/:id/pick/:quoteId — quote 선택

### 2-3. Operator 자동화 (서버 내부)
- [x] 매칭 감지 → CREATE2 배포 (operator EOA)
- [x] 양쪽 입금 모니터링 (polling)
- [x] settle() 자동 호출
- [x] 타임아웃 감지 → refund() + reputation 페널티

---

## Phase 3: DB 스키마 업데이트 ✅

### 3-1. offers 테이블 확장
- [x] computed_escrow_address TEXT
- [x] nonce BIGINT
- [x] min_score INTEGER DEFAULT 0
- [x] status 확장: open → matched → deployed → settled / cancelled / expired

### 3-2. reputation 테이블 (신규)
- [x] wallet TEXT PRIMARY KEY
- [x] successful_swaps, failed_swaps, cancellations, score
- [x] RLS: 읽기만 public, 쓰기는 service_role만

### 3-3. RLS 강화
- [x] offers: 읽기 public, 쓰기는 service_role만
- [x] reputation: 읽기 public, 쓰기는 service_role만

---

## Phase 4: CLI 리팩터링 ✅

### 4-1. API 클라이언트 모듈
- [x] src/api.ts — Fastify 서버 호출 (fetch 기반)
- [x] 기존 Supabase 직접 호출 제거 (propose, accept, list, trust, rfq, quote, pick, cancel)

### 4-2. 명령어 변경
- [x] propose → POST /offers + 토큰 transfer
- [x] accept → POST /offers/:id/accept + 토큰 transfer
- [x] list → GET /offers (score 컬럼 표시)
- [x] trust → GET /reputation/:wallet
- [x] cancel → POST /offers/:id/cancel
- [x] rfq → POST /rfq
- [x] quote → POST /rfq/:id/quote
- [x] pick → POST /rfq/:id/pick/:quoteId
- [x] quotes → GET /rfq/:id/quotes

### 4-3. Score 관련
- [x] propose에 --min-score 옵션 추가
- [x] list에서 seller score 표시
- [x] accept 전 buyer에게 seller score 표시

---

## Phase 5: SDK 리팩터링 ✅

- [x] ZeroOTC class → API 서버 호출로 전환
- [x] Supabase 직접 의존 제거
- [x] 기존 인터페이스 유지 (breaking change 최소화)

---

## Phase 6: 레거시 정리 ✅

- [x] 기존 Escrow.sol — deprecated 표시, 제거하지 않음
- [x] 기존 v1 명령어 제거 (deposit, refund, claim-timeout, auto-accept)
- [x] 기존 v1 SDK 모듈 제거 (sdk/swap.ts, sdk/rfq.ts)

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

## Remaining Follow-ups

- [ ] Server tests (unit + integration)
- [ ] EscrowFactory deploy script
- [ ] server/.env.example template
- [ ] history.ts / watch.ts → API 전환 (현재 read-only Supabase 직접 호출)
- [ ] server/package-lock.json 커밋
