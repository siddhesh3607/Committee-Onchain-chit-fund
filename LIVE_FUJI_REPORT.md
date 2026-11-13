# Committee — public Fuji test results

Verified 13 November 2026 at 1:53:53 pm (India time), chain ID **43113**.

## Outcome: completed with RPC timing findings

The financial invariants, default handling, payouts, completion and withdrawal checks passed on public Fuji. The intended all-revealed auction sequence did **not** pass without exceptions: two RPC interruptions caused missed reveal windows. The original failed assertions are preserved in the result JSONs; no failed run is relabeled as a clean pass.

| Item | Verified result |
|---|---|
| Factory | [0xb669cf7b3938df35938e0b813cf4ce61258a31da](https://testnet.snowtrace.io/address/0xb669cf7b3938df35938e0b813cf4ce61258a31da) |
| User-submitted factory deployment | [0x15ca8bb9…](https://testnet.snowtrace.io/tx/0x15ca8bb99194873eed376ebc7065f857238c11a7db46ac28d763f79d1b1b1f00); successful; creation bytecode matches this project |
| First circle | [0xa2c44D13488D785DF8b3A08A513f4c39ffF87230](https://testnet.snowtrace.io/address/0xa2c44D13488D785DF8b3A08A513f4c39ffF87230) |
| Second circle | [0x63e080868dfBD688eEb9f4B8c2F652B045F79209](https://testnet.snowtrace.io/address/0x63e080868dfBD688eEb9f4B8c2F652B045F79209) |
| Completed circles / rounds | **2 / 10** |
| Confirmed automated QA transactions | **119**; every receipt checked independently |
| Successful auction reveals / zero-discount fallbacks | **8 / 2** |
| Voluntary contributions / commitments / settlements | **48 / 10 / 10** |
| Prize/collateral withdrawal transactions | **12** |
| Final balance in each circle contract | **0 AVAX** |
| Remaining in the five test wallets | **0.0 AVAX** |

Every member received one prize in each circle. Each settlement preserved contract balance = collateral + dividend credits + claimable prizes/commission. Both circles completed and all balances were withdrawn.

## Funding and return

| Ledger item | Test AVAX |
|---|---|
| Funded by you | **0.1** |
| Returned to your original wallet | **0.099999997954534163** |
| Gas consumed by all recorded QA transactions | **0.000000002045465837** |
| Remaining in test wallets | **0.0** |
| Remaining in circle contracts | **0** |

Return recipient: [0x5f37c2fc7411c121351c849ad5a3f706d8c73ed2](https://testnet.snowtrace.io/address/0x5f37c2fc7411c121351c849ad5a3f706d8c73ed2). Integer-wei verification confirms that returns + gas + remaining balances equal the funded 0.1 AVAX exactly. Your factory-deployment gas and the gas you paid to fund the QA wallet are separate from this 0.1 AVAX ledger.

| Test wallet | Returned test AVAX | Confirmed return transaction |
|---|---|---|
| 2 | 0.012212499897115954 | [0x77eb1b67…](https://testnet.snowtrace.io/tx/0x77eb1b67f2edb8cc71c05fc0732bb8e4b77803cb8bf692b25bcd08f706a14f37) |
| 3 | 0.012212499897309385 | [0x8ef6c43a…](https://testnet.snowtrace.io/tx/0x8ef6c43aa49e66fb30bea226c7847db1b0014c693f61be65f80b7733ff9be880) |
| 4 | 0.012212499897216015 | [0xa058472b…](https://testnet.snowtrace.io/tx/0xa058472b07b5a2d40907b2f279b51989bff9783442550c9cbe084fb9b4c5e7be) |
| 5 | 0.012212499906511061 | [0x506433f0…](https://testnet.snowtrace.io/tx/0x506433f0bafecc6b2c8220141725deb0f5aa50c99f0519dd2407c9b25db979e0) |
| 1 | 0.051149998356381748 | [0x56d3ec3a…](https://testnet.snowtrace.io/tx/0x56d3ec3a5a5373915f640a05c328fdd0652ef8164c785b52cccb90320145570c) |

## Actual round results

Each nominal pot was **0.005 AVAX**: five members × 0.001 AVAX. A normal winning discount was 0.001, yielding a 0.004 prize, 0.0002375 credit for each other member, and a 0.00005 foreman commission.

| Run | Round | Winner | Prize AVAX | Discount AVAX | Dividend / other member | Collateral slashed |
|---|---|---|---|---|---|---|
| 1 | 1 | Wallet 1 | 0.004 | 0.001 | 0.0002375 | 0.0 |
| 1 | 2 | Wallet 2 | 0.004 | 0.001 | 0.0002375 | 0.0007625 |
| 1 | 3 | Wallet 3 | 0.004 | 0.001 | 0.0002375 | 0.0 |
| 1 | 4 | Wallet 4 | 0.005 | 0.0 | 0.0 | 0.0 |
| 1 | 5 | Wallet 5 | 0.004 | 0.001 | 0.0002375 | 0.0 |
| 2 | 1 | Wallet 1 | 0.005 | 0.0 | 0.0 | 0.0 |
| 2 | 2 | Wallet 2 | 0.004 | 0.001 | 0.0002375 | 0.001 |
| 2 | 3 | Wallet 3 | 0.004 | 0.001 | 0.0002375 | 0.0 |
| 2 | 4 | Wallet 4 | 0.004 | 0.001 | 0.0002375 | 0.0 |
| 2 | 5 | Wallet 5 | 0.004 | 0.001 | 0.0002375 | 0.0 |

The first circle’s round-two default consumed its existing 0.0002375 credit, then slashed exactly **0.0007625 AVAX**. The second circle’s first-round fallback paid no dividend, so its round-two default correctly required **0.001 AVAX** from collateral. After a normal dividend, the round-three cash payment was **0.0007625 AVAX** rather than 0.001.

## Preserved transport/timing failures

- **First run, round four:** the primary RPC exhausted retries after the commitment. On resumption its reveal window had passed. The contract correctly applied its zero-discount fallback. Two original discount/dividend assertions failed and remain in the first result file.
- **Second run, round one:** a connection reset interrupted the runner after commitment. On resumption that reveal window had also passed. Its fallback was correct, but the two original auction assertions and the next round’s pre-dividend slash expectation failed. Those three failures remain in the second result file.
- Read retries were added to the runner. Public UI reads were batched, and a stale RPC-error banner now clears when reads recover without clearing unrelated wallet errors. No contract economic rules were changed.

The on-chain fallback handled the interruptions without blocking completion or locking funds. Public-RPC reliability and short demo windows remain an integration concern; these runs are not evidence of a flawless timed auction sequence.

## Signing and UI scope

Your submitted factory transaction confirms a valid public-Fuji deployment from your wallet with the correct bytecode. The other lifecycle transactions were signed by the five disposable QA accounts, whose keys were kept in a user-bound encrypted local file. No keys or unrevealed bid salts are included in these deliverables.

The published UI was checked against actual Fuji circle state. The agent did not independently operate or inspect every real Core/MetaMask extension signing dialog; the earlier local wallet-harness tests and this public-chain test are complementary layers of evidence.

The prior **23 JavaScript/integration tests**, **16 Foundry tests**, **2,048 fuzz cases** and **100% measured contract coverage** remain documented in TEST_REPORT.md. Existing installed dependency advisory findings remain open. None of this replaces an independent security audit.

## Evidence

- fuji-live-independent-verification.json: independently checked public receipts, round values, balances and the complete gas/return ledger.
- fuji-live-test-results.json: original run with its two failed planned assertions.
- fuji-live-test-results-retry.json: second run with its three failed planned assertions.
- fuji-live-deployment.json: your verified factory deployment.
- fuji-live-test-plan.json: public test parameters and member addresses only.

Read-only replay: after installing dependencies and compiling, run `node scripts/verify-fuji-live.mjs` from the project. It submits no transactions.
