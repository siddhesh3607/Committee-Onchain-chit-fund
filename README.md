# Committee · Avalanche Fuji

A verified factory is deployed at `0xb669cf7b3938df35938e0b813cf4ce61258a31da`. Load that address in the app to create a new circle, or deploy your own. Actual public-network results, failed timing assertions and fund returns are in [LIVE_FUJI_REPORT.md](LIVE_FUJI_REPORT.md).

A working native-AVAX chit fund prototype: factory, immutable circle contracts, commit–reveal reverse auction, dividend credits, collateral-funded defaults, and a React + wagmi dashboard. **Testnet only. Unaudited. No real-money or INR deposits.**

## The Arena edition

The default home is now **The arena**: a dark lime-and-violet experience with an interactive five-person circle.

- **Take it for a spin:** walk through contributions, sealed bids, reveal, and settlement without a wallet. Inspect each member's collateral, dividend credit, and prize balance. Play or pause an automatic five-round tour.
- **Chaos switch:** make Zoya miss the second payment. At settlement, her existing credit is used first, then exactly 0.007625 AVAX is slashed from collateral in the default example. Reset the tour to try another scenario.
- **Auction experiments:** during the commit step, change the first eligible member's proposed discount or make everyone withhold their reveals to demonstrate the deterministic zero-discount fallback.
- **Dividend lab:** change member count, contribution, winning discount, and foreman share. The money flow and next-payment calculation update immediately using integer wei arithmetic.
- **Round cards:** download an SVG receipt for a simulated result or a settled live Fuji round. Simulation receipts are visibly labeled and never claim an on-chain transaction.
- **Live circles:** connect a wallet to use the actual Fuji contracts. The live auction view shows sealed versus revealed bids and a provisional leader. Invitations still open the live circle directly.
- **Factory recovery:** addresses are checked for deployed code before reading the factory. An invalid saved address can be cleared directly in the setup panel. Creation stays disabled until the factory can be read successfully.

Simulation state is local and resets when you leave the arena or reload. It never writes transactions. `src/mechanism.mjs` implements the arithmetic; an integration test compares every member's balances against deployed Solidity after each of five rounds, including the default. The simulation does not implement real cryptographic commitments; real wallet bidding still uses the Solidity commit–reveal protocol.

## Run

Requires Node.js 22+ and an injected EVM wallet such as Core or MetaMask.

```sh
npm ci
npm run build
npm test
npm run dev
```

Open the printed local URL. Connect your wallet and switch to Fuji. Get test AVAX from the [Avalanche faucet](https://build.avax.network/console/primary-network/faucet).

1. Click **Deploy factory**, approve the wallet transaction, and wait for confirmation. The address is saved in this browser. Alternatively load a deployed factory address; no deployment is required for invited members.
2. Create a circle. Defaults: five members, 0.01 AVAX per round, 120 seconds per round, and 500 basis points (5%) of the winning discount to the foreman.
3. Copy the invitation. Each of five wallets joins with **0.05 AVAX collateral**, plus gas. Contributions are additional. Fund each with about 0.10 test AVAX; factory deployment needs extra gas.
4. Once all members join, anyone can start. Each round has 40 seconds to contribute, 40 to commit, and 40 to reveal. Anyone can settle at 120 seconds.
5. After committing, export the **private bid backup**. Reveal from the same browser or import the backup. Never share it before reveal. Losing the salt forfeits that bid, not membership.
6. The highest revealed discount wins. Withdraw prizes immediately using **Withdraw balance**. After five rounds, withdraw remaining collateral and unused credits too.

**A verified deployed factory is available above.** Factory selection remains browser-local; load its address or deploy another factory with your funded Fuji wallet. The app never requests or handles private keys. A hosted frontend alone does not mean the contracts have been deployed.

## The six-minute demo

Use five browser wallet accounts/profiles. Start after arranging the wallets; each phase is deliberately short.

| Round | Demonstration |
|---|---|
| 1 | All contribute. Member 1 commits and reveals a 0.01 AVAX discount. Settle: 0.04 AVAX prize, 0.0005 AVAX foreman share, 0.002375 AVAX credit for each other member. |
| 2 | Member 5 skips contribution. Other members contribute (credits reduce their dues). Member 2 wins with a 0.01 AVAX discount. Settlement uses member 5's 0.002375 AVAX credit and slashes 0.007625 AVAX collateral. |
| 3 | Member 3 owes 0.007625 AVAX instead of the base 0.01 AVAX: the round-two dividend offsets this payment. The round-one dividend was already used in round two. Show this in the dashboard, then complete bidding and settlement. |

Each round begins when the previous settlement transaction executes. Three rounds take **at least six minutes**, plus transaction/signing latency; six minutes exactly cannot be guaranteed. Five members require five total rounds, so after the three-round demo, finish rounds 4–5 to release collateral. No-reveal rounds can be settled without bids.

An accelerated local EVM demo runs the complete lifecycle without waiting:

```sh
npm run compile
npm run demo:local
```

For an automated **real Fuji** demo, set `DEMO_PRIVATE_KEYS` in your process environment to five comma-separated funded testnet-only keys, then run `node scripts/demo.mjs --fuji`. It creates a factory and circle, performs three real 120-second rounds, and prints public addresses/results. Keys are never printed or saved. Set `DEMO_ROUNDS=5` to finish and withdraw everything. Keep the process running; do not use wallets shared with another signing process. The UI can open the printed circle address while it runs. Demo script salts are public and intended only for testnet demonstration; browser bids use secure random salts.

## Economic rules

- A circle has N members and N rounds. The nominal pot is N × contribution. Every member wins exactly once, including those whose obligations are paid from collateral.
- Joining locks N × contribution per member, covering the worst case of missing every payment. This prioritizes solvency over capital efficiency. The deposit is **additional** to regular contributions and cannot be withdrawn early.
- Contributions consume credit up to one contribution, then require the exact AVAX shortfall. Even a zero-due member must submit a contribution transaction to be eligible to bid.
- Only members who paid voluntarily in the current contribution window and have never won may commit. Commitments bind chain ID, contract, round, wallet, discount, and salt using `keccak256(abi.encode(...))`.
- The highest valid discount strictly below the pot wins. Ties use original join order, irrespective of reveal order. If there are no valid reveals, the first member in join order who has not won receives the full pot. Such a fallback winner can be a defaulting member; their obligations remain secured by collateral.
- Foreman commission is **a percentage of the winning discount**, not the pot. It is capped at 10% of the discount. The rest is distributed to the N−1 other members, including earlier winners. Integer division dust is credited to the foreman. Zero discount means zero commission.
- Settlement consumes credit first for missed contributions, then slashes the exact shortfall from collateral. This covers the payment; it is not an additional penalty. Default does not expel a member or remove their eventual prize entitlement.
- Dividends stay inside the contract as credits for later contributions. At completion, unused credits and remaining collateral become withdrawable. Prizes and commissions are separate pull-payment balances and can be withdrawn immediately to any chosen recipient.
- Enrollment expires 24 hours after creation. The circle must start before that deadline with all N members. If unstarted at expiry, anyone can cancel; each member can recover their entire deposit. Started circles run to completion and have no administrator escape hatch.
- Timing and settlement are permissionless, but **not automatic**: someone must send `start`, `settle`, and withdrawal transactions. No external automation service is required.

## Contracts and checks

See [TEST_REPORT.md](TEST_REPORT.md) for expanded cases, browser-tested fixes, exact coverage, and unresolved dependency findings. The disposable local wallet harness is excluded from production builds.

`contracts/Chit.sol` and `contracts/ChitFactory.sol` use Solidity 0.8.30 with optimizer and Paris EVM target. There are no Solidity library dependencies, tokens, price feeds, privileged upgrades, or external calls during settlement. At most 32 members bounds settlement gas. Recipient transfers happen through a reentrancy-guarded pull withdrawal.

`npm test` compiles with solc and uses Ganache + ethers to exercise five-wallet settlement, exact accounting, round-two default, reduced round-three dues, all-default completion, auctions, tie breaks, invalid reveals, expired enrollment refunds, input constraints, and final withdrawals.

Foundry tests (including fuzzed discount accounting) are in `test/foundry/Chit.t.sol` and have no forge-std dependency:

```sh
forge test -vv
```

## Deploy from CLI (optional)

The browser wallet route is preferred. For CLI deployment, set `DEPLOYER_PRIVATE_KEY` in the process environment to a funded testnet key and optionally `FUJI_RPC_URL`, then:

```sh
npm run compile
npm run deploy:fuji
```

The script refuses a chain other than 43113 and writes only public deployment information to `deployments/fuji.json`. Copy that factory address into the app. Do not paste keys into chat or commit secrets. `.env.example` documents variables, but CLI scripts read process environment directly (they do not automatically load `.env`). Vite reads `VITE_` variables at build time; these must contain only public configuration.

Official [Fuji network configuration](https://build.avax.network/docs/primary-network): chain ID **43113**, RPC **https://api.avax-test.network/ext/bc/C/rpc**, gas token **AVAX**. The UI displays AVAX throughout; it makes no claim to represent rupees or a stable-value savings product.

## Frontend hosting

`npm run build` generates static files in `dist/`. Host that directory using Sites or any static host. The frontend is independent of the factory; it supports direct invitations through `?chit=0x…`. Optional `VITE_FACTORY_ADDRESS` supplies a default factory. User-selected factory and circle addresses, and bid salts, are browser-local. No backend or secret environment variables are needed for hosting.

## Limitations

This is a hackathon testnet implementation, not a production financial service. It has not had an independent security audit or legal review. Full collateral requirements are capital intensive. Public reveal transactions may disclose bids before other participants reveal; commit–reveal prevents changing committed bids but does not prevent strategic withholding. Enrollment cannot restrict who joins, so share a newly created circle with trusted members promptly. There is no on-chain INR peg, identity verification, membership allowlist, keeper, or recovery of lost bid salts. RPC availability and wallet signing speed affect the short demo windows.
