# Committee — test report

**Public Fuji update (13 November 2026):** see [LIVE_FUJI_REPORT.md](LIVE_FUJI_REPORT.md). Two real circles completed, all funds withdrew and unused funds returned, with recorded RPC timing failures. The historical local-test results below are unchanged.

Tested 12 November 2026 on Windows, Node.js 22.14.0, Solidity 0.8.30. Public hosting checks are distinguished from transactions on a disposable local EVM.

## Results

| Check | Final result |
|---|---|
| JavaScript, CLI and EVM integration tests | **23 passed, 0 failed** |
| Foundry tests | **16 passed, 0 failed** |
| Foundry fuzzing | **1,024 cases for each of two tests: 2,048 cases** |
| Simulator randomized schedules | **500 schedules × 25 transitions; conservation checked at all 12,500 transitions** |
| Chit.sol coverage | **100% lines (82/82), statements (138/138), branches (54/54), functions (17/17)** |
| ChitFactory.sol coverage | **100% lines (4/4), statements (4/4), functions (2/2); no measured branches** |
| Production build / TypeScript | Passed |
| Local browser wallet workflow | Passed, with supporting wallets and remaining rounds driven by the fixture script |
| Layout | Inspected at 1440×900 and 390×844; no horizontal document overflow |
| Installed production dependency audit | **Open: 54 advisory entries** |
| Actual public Fuji transactions / extension signing | **Not performed** |

Coverage was measured separately with `forge coverage`, using its default 256 cases per fuzz test. The 1,024-case results come from the regular Foundry run. Coverage is evidence of executed code, not a security guarantee.

## Contract and integration cases

Cases live in `test/lifecycle.test.mjs`, `test/foundry/Chit.t.sol`, and `test/foundry/Security.t.sol`.

| Scenario | Expected behavior / assertion | Result |
|---|---|---|
| Five wallets, five rounds | Each wins once; default covered; later dues reduced; all funds withdraw | Pass |
| Highest / tied bids | Highest valid discount wins; equal bids use join order regardless of reveal order | Pass |
| No reveals | Zero-discount fallback awards the first unawarded member | Pass |
| All-default lifecycle | Collateral covers all payments; completion remains solvent | Pass |
| Maximum 32 members | All 32 default through 32 rounds; unique awards; final contract balance zero | Pass |
| Settlement gas | Each 32-member settlement stays below the test’s 4,000,000-gas budget | Pass |
| Exact deadlines | Contribution before 40s, commit at 40s, reveal at 80s, settlement at 120s | Pass |
| Non-divisible duration | A 31-second round has contiguous windows and settles correctly | Pass |
| Expired enrollment | Partial or full unstarted circles cancel/refund; starting after expiry fails | Pass |
| Membership rejection | Wrong collateral, duplicate/excess/late members fail | Pass |
| Contribution rejection | Wrong amount, duplicate, non-member and late payments fail | Pass |
| Commit rejection | Unpaid members, prior winners, zero and duplicate commitments fail | Pass |
| Reveal rejection | Wrong amount/salt, missing commitment, early/late/duplicate reveal fails | Pass |
| Replay protection | Commitments bind contract, chain, member and round; copied commitments cannot reveal | Pass |
| Discount / dividend arithmetic | Pot = prize + commission + other members’ credits; dust accounted for | Pass |
| Large credit | Zero cash due; leftover credit carries and can cover a missed payment without a slash | Pass |
| Reentrant recipient | Nested withdrawal attempted and blocked; prize paid once | Pass |
| Rejecting recipient | Failed transfer preserves claim; recipient cannot block settlement and can redirect withdrawal | Pass |
| Withdrawal rejection | Zero recipient, double withdrawal and early collateral release fail | Pass |
| Randomized lifecycle | Mixed payments, bids, withheld reveals and early withdrawals conserve liabilities; final balance zero | Pass |
| Bounds / getters | Constructor validation and all factory/circle getter functions exercised | Pass |
| Simulator parity | Every member’s collateral, credit, prizes and win state match deployed Solidity over five rounds | Pass |

## Browser wallet cases

Transactions used a **development-only EIP-1193 adapter** and an unlocked Ganache node at `127.0.0.1:8545`, with chain ID 43113. The real React/wagmi handlers were exercised using disposable local coins. The adapter performs gas estimation normally supplied by an extension wallet. No user keys or public-network funds were used.

| Case | Observed result |
|---|---|
| Connect / deploy factory | Account appeared; deployment receipt confirmed; address saved and validated |
| Create circle | Contract address appeared in circle list and invitation URL |
| Join from two wallets / switch account | Exact collateral accepted; personal standing followed the active account |
| Complete enrollment | Fixture joined the remaining three wallets; UI enabled Start at 5/5 |
| Start / contribute | UI transactions succeeded; supporting wallets paid through the fixture |
| Fresh bid cancellation | Reproduced locked input, then retested the fix: reject → edit 0.005 to 0.006 → commit succeeded |
| Bid backup export / recovery | Downloaded JSON restored; preimage independently matched the local contract commitment |
| Wrong backup | Another wallet/round backup was rejected; correct existing bid remained available |
| Reveal | Correct discount revealed; provisional leader displayed |
| First settlement | Prize 0.045 AVAX; dividend exactly 0.0011875 per other member; fee 0.00025 |
| Second settlement with default | Prize 0.044; dividend 0.001425; **0.0088125 AVAX slashed** from wallet 5 |
| Next contribution | Non-winning member’s next due was exactly **0.008575 AVAX** |
| Completion | Fixture settled remaining three rounds with zero-reveal fallbacks; UI displayed completion and all five results |
| UI withdrawal | Wallet 1/foreman withdrew **0.066975 AVAX**, including remaining collateral; displayed balance became zero |
| Drain remaining balances | Fixture withdrew the other wallets; contract balance asserted to be zero |
| Responsive rendering | No horizontal document overflow at 390px and 1440px; screenshots inspected |
| Production-build autoplay | Automatically completed all five rounds; controls became disabled at completion; no browser errors in the clean production-preview session |
| Download result card | Downloaded round-five SVG parsed as valid XML and explicitly labels the result as a simulation |

The harness (`e2e.html`, `test/wallet-harness.ts`, `scripts/e2e-chain.mjs`, `scripts/e2e-fixture.mjs`) requires DEV mode, `VITE_E2E=1`, and a loopback hostname. Production output was checked to exclude both the QA adapter and local QA RPC URL.

## Additional cases

- 500 seeded simulation schedules vary bids, missed payments and reveal withholding, with no negative balances and exactly one prize per member.
- Calculator checks conserve every wei for 2–12 members, dust values and both fee extremes, with additional 32-member arithmetic cases.
- SVG receipts escape user text and label simulations.
- AVAX formatting preserves one wei, fractional dividends and large values without floating-point conversion.
- Only an explicit rejection of a new draft permits deleting its preimage. Unknown failures and rejected retries keep an earlier preimage.
- Missing-key deployment fails before network activity. A mock RPC reporting mainnet is rejected before any transaction submission.

## Bugs fixed

1. **Malformed SVG receipt:** 15 ampersands followed by a quote is a valid 16-byte circle name, but truncation cut its escaped `&quot;` entity in half. Truncation now happens before escaping. The failing regression now passes.
2. **Bid locked after wallet rejection:** a fresh rejected draft now unlocks for editing. Existing uncertain attempts retain their backup; rejecting a retry cannot destroy the preimage of an older pending transaction. Browser retest passed.
3. **Rounded AVAX balances/receipts:** 0.0011875 previously displayed as 0.001188. A shared integer formatter now preserves the exact amount down to one wei. Unit and browser checks passed.

A development-only duplicate React root warning during hot reload was also addressed by retaining the root between module updates.

## Dependency findings still open

`npm audit --omit=dev --json` reported **54 installed dependency entries: 4 critical, 33 high, 16 moderate and 1 low**. These include transitive propagation, not 54 independently demonstrated application exploits.

`scripts/audit-bundle.mjs` compared audited installation paths against files actually rendered into production JavaScript. Only the transitively flagged root `wagmi` package appeared; **none of the package paths carrying direct advisory objects were rendered into the browser chunks** in this build.

This narrows observed browser exposure but does not clear the installed dependency tree or assess all exploit paths. Some suggested resolutions require a major wagmi migration. No forced major upgrade was applied during functional QA. Dependency remediation remains necessary before a production release.

## Reproduce

```sh
npm ci
npm test
forge test --fuzz-runs 1024 -vv
forge coverage --report summary --report lcov --report-file coverage.lcov
npm run build
```

For UI QA, run `node scripts/e2e-chain.mjs` in one terminal. In a second terminal set `VITE_E2E=1` and `VITE_FUJI_RPC_URL=http://127.0.0.1:8545`, run `npm run dev`, and open `http://127.0.0.1:5173/e2e.html`. Never fund the deterministic fixture accounts on public networks. Build production with the public Fuji RPC, not the QA variables.

The companion `committee-test-evidence.zip` contains test outputs, coverage, audit metadata and local-chain assertions. No wallet keys or private bid salts are included in the evidence archive.

## Limits

- No actual public Fuji transactions were submitted. Local chain ID 43113 is not evidence of a public Fuji deployment.
- Real Core/MetaMask dialogs, hardware wallets, mobile wallet browsers and cross-device recovery were not exercised. The adapter tests the app’s EIP-1193 flow, not every extension implementation.
- No independent security/economic audit, penetration test, legal review or formal verification was performed.
- Live Fuji rehearsal still needs a funded test wallet. Do not use real funds based on this report.
