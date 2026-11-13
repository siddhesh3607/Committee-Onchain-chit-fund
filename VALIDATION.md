# Validation

Public-network follow-up: [LIVE_FUJI_REPORT.md](LIVE_FUJI_REPORT.md) documents actual Fuji transactions, recovered RPC interruptions, final balances and returned funds. Statements below describing public Fuji as unperformed refer to the earlier local test run.

The latest cases, fixes, results and limitations are in [TEST_REPORT.md](TEST_REPORT.md).

- 23 JavaScript, CLI and local-EVM tests passed.
- 16 Foundry tests passed, including 2,048 fuzz cases.
- Both Solidity contracts reached 100% measured line, statement, branch and function coverage.
- 500 randomized simulator schedules conserved balances through 12,500 transitions.
- Browser wallet QA exercised factory deployment, circle creation, account switching, membership, contribution, signing rejection/retry, backup recovery, reveal, settlement, slashing and withdrawal on a disposable local chain. All wallets ultimately withdrew and the contract balance reached zero.
- Production build and TypeScript checks passed; mobile and desktop layouts were inspected.
- 54 installed dependency advisory entries remain open. Directly advisory-affected package paths were not found in rendered browser JavaScript; this does not replace remediation.
- No actual public Fuji transactions or real extension-wallet signing dialogs were exercised. This is not an independent security audit.