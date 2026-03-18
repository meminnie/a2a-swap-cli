# Manual Test Cases

CLI/API를 직접 호출하여 검증하는 수동 테스트 시나리오 목록.
핵심은 settle/refund/cancel 3가지 종료 경로에서 reputation이 올바르게 반영되는지 확인하는 것.

---

## Offer 플로우

### TC-01: 정상 Settle

1. `POST /offers` — seller가 offer 생성
2. seller가 escrow에 sell_token 입금
3. `POST /offers/:id/accept` — buyer가 accept
4. buyer가 escrow에 buy_token 입금
5. operator loop이 양쪽 잔고 확인 후 settle
6. **검증**
   - offer status = `settled`
   - seller `successful_swaps +1`
   - buyer `successful_swaps +1`

### TC-02: Buyer 미입금 → Refund

1. offer 생성 → buyer accept → escrow deployed
2. buyer가 buy_token **미입금**
3. deadline 경과 후 operator가 refund 처리
4. **검증**
   - offer status = `expired`
   - buyer `failed_swaps +1` (score -3)

### TC-03: Open 상태 Seller Cancel (페널티 없음)

1. `POST /offers` — offer 생성
2. `POST /offers/:id/cancel` — seller가 cancel
3. **검증**
   - `penalty = false`
   - reputation 변동 없음
   - offer status = `cancelled`

### TC-04: Deployed 후 Seller Cancel (페널티)

1. offer 생성 → buyer accept → escrow deployed
2. `POST /offers/:id/cancel` — seller가 cancel
3. **검증**
   - `penalty = true`, `scoreDelta = -2`
   - seller `cancellations +1`
   - offer status = `cancelled`

### TC-05: 온체인 Cancel 감지

1. offer 생성 → accept → deployed
2. seller가 **컨트랙트에서 직접** escrow cancel 호출
3. operator loop이 `isEscrowCancelled` 감지
4. **검증**
   - seller `cancellations +1`
   - offer status = `cancelled`

### TC-06: Deployed 후 Buyer Cancel (페널티)

1. offer 생성 → accept → deployed
2. `POST /offers/:id/cancel` — **buyer**가 cancel
3. **검증**
   - `penalty = true`, `scoreDelta = -2`
   - buyer `cancellations +1`
   - offer status = `cancelled`

### TC-07: 비참여자 Cancel 거부

1. offer 생성
2. seller도 buyer도 아닌 제3자가 cancel 시도
3. **검증**
   - 403 에러, `Not a participant`

### TC-08: Settled Offer Cancel 거부

1. settle 완료된 offer에 cancel 시도
2. **검증**
   - 400 에러, `Cannot cancel offer in status: settled`

---

## Accept 검증

### TC-09: Min Score 미달 Buyer 거부

1. `min_score: 10`으로 offer 생성
2. score 0인 buyer가 accept 시도
3. **검증**
   - 403, `below minimum`

### TC-10: 만료된 Offer Accept 거부

1. deadline이 지난 offer에 accept 시도
2. **검증**
   - 400, `expired`
   - offer status 자동으로 `expired` 전환

---

## RFQ 플로우

### TC-11: RFQ 정상 플로우

1. `POST /rfq` — RFQ 생성
2. `POST /rfq/:id/quote` — quoter가 견적 제출
3. `GET /rfq/:id/quotes` — 견적 목록 + `quoterScore` 확인
4. `POST /rfq/:id/pick/:quoteId` — seller가 견적 선택
5. **검증**
   - escrow 배포됨 (`escrowAddress`, `txHash` 반환)
   - 선택된 quote status = `accepted`
   - 나머지 quote status = `rejected`
   - rfq status = `deployed`

### TC-12: 만료된 RFQ에 Quote 거부

1. deadline 지난 RFQ에 quote 제출
2. **검증**
   - 400, `RFQ has expired`

### TC-13: Score 미달 Quoter 거부

1. `min_score: 5`인 RFQ에 score 0인 quoter가 quote 제출
2. **검증**
   - 403, `below minimum`

### TC-14: 닫힌 RFQ에 Pick 거부

1. 이미 deployed된 RFQ에 다시 pick 시도
2. **검증**
   - 400, `RFQ is not open`

### TC-15: RFQ Deploy 실패 시 Rollback

1. pick 시도했는데 escrow deploy 실패
2. **검증**
   - quote status가 다시 `pending`으로 롤백
   - 500 에러 반환

---

## Reputation

### TC-16: 기존 Wallet Reputation 조회

1. `GET /reputation/:wallet` — 거래 이력 있는 wallet
2. **검증**
   - `successfulSwaps`, `failedSwaps`, `cancellations`, `score` 정상 반환

### TC-17: 신규 Wallet Reputation 조회

1. 거래 이력 없는 wallet 조회
2. **검증**
   - 모든 값 0으로 반환

---

## Operator Loop

### TC-18: Open Offer 자동 만료

1. offer를 open 상태로 두고 deadline 경과
2. operator loop 실행
3. **검증**
   - offer status = `expired`
   - reputation 변동 없음
