// =============================================================================
// Flash Loan Attack Test Suite
// =============================================================================
//
// INVARIANT UNDER TEST
// --------------------
// The vault enforces the following balance invariant at the start of every
// mutating operation (deposit, withdraw, harvest):
//
//     token.balance(vault_address) == storage::total_deposited
//
// This invariant prevents flash-loan-assisted price manipulation.  A flash
// loan attacker could:
//
//   1. Borrow a large amount of the underlying token in a single transaction.
//   2. Transfer (donate) those tokens directly to the vault contract address,
//      inflating the on-chain balance above what the vault's accounting
//      (total_deposited) tracks.
//   3. Call deposit / withdraw / harvest while the inflated balance is in
//      effect, exploiting the skewed share-price to drain value from other
//      depositors.
//   4. Repay the flash loan in the same transaction, pocketing the profit.
//
// The guard detects step 2 immediately: before executing any logic, the
// contract compares the live token balance of the vault address against
// total_deposited.  Any discrepancy causes the call to emit a `suspicious`
// event and return `VaultError::BalanceMismatch` (error 12), reverting all
// state changes.
//
// TEST STRATEGY
// -------------
// In Soroban's test environment there is no native flash-loan primitive, but
// the observable effect — the vault's token balance diverging from
// total_deposited — is reproducible by minting tokens directly to the vault
// address via the Stellar Asset Contract admin interface.  This is equivalent
// to a direct token transfer (the attack vector) without the loan wrapper.
//
// The three tests below cover all three guarded entry-points:
//   • test_flash_loan_balance_manipulation  — guard fires on deposit
//   • test_flash_loan_guard_blocks_withdraw — guard fires on withdraw
//   • test_flash_loan_guard_blocks_harvest  — guard fires on harvest

#![cfg(test)]

extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env};
use soroban_sdk::token::StellarAssetClient;

use crate::{AuraVault, AuraVaultClient, VaultError};

// ---------------------------------------------------------------------------
// Shared test helpers (mirrors test.rs — kept local to avoid cross-module
// coupling so this file can stand alone as a security regression suite).
// ---------------------------------------------------------------------------

/// Deploy and initialise a fresh vault.
///
/// Returns `(env, vault_client, vault_address, admin_address, token_address)`.
/// The `vault_address` is returned separately so tests can mint tokens
/// directly to the vault to simulate balance inflation without going
/// through the contract's own entry-points.
fn setup() -> (Env, AuraVaultClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);

    // Register a real Stellar Asset Contract (SEP-41) as the underlying token.
    let token_address = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();

    let vault_address = env.register_contract(None, AuraVault);
    let vault = AuraVaultClient::new(&env, &vault_address);
    vault.initialize(&admin, &token_address);

    (env, vault, vault_address, admin, token_address)
}

/// Mint `amount` tokens to `recipient` using the SAC admin interface.
fn mint(env: &Env, token: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(recipient, &amount);
}

// ---------------------------------------------------------------------------
// Test 1 — Flash Loan Guard: deposit entry-point
// ---------------------------------------------------------------------------

/// INVARIANT: token.balance(vault) == total_deposited
///
/// Attack scenario
/// ---------------
/// 1. Vault is freshly initialised; total_deposited = 0.
/// 2. Attacker mints 500_000 tokens *directly* to the vault address,
///    simulating a flash-loan-funded donation that bypasses deposit().
///    After this step: on-chain balance = 500_000, total_deposited = 0.
/// 3. Attacker then calls deposit() hoping the inflated balance will cause
///    their shares to be computed against a lower total_deposited, letting
///    them steal future depositors' value.
///
/// Expected outcome: the guard detects balance_before (500_000) ≠
/// total_deposited (0) and returns VaultError::BalanceMismatch before any
/// state change, leaving the vault fully intact.
#[test]
fn test_flash_loan_balance_manipulation() {
    let (env, vault, vault_address, _admin, token) = setup();

    let attacker = Address::generate(&env);

    // Give the attacker tokens they intend to deposit.
    mint(&env, &token, &attacker, 1_000_000);

    // --- ATTACK STEP ---
    // Donate tokens directly to the vault address, bypassing deposit().
    // This is the on-chain equivalent of a flash-loan-funded balance inflation:
    // the vault's token balance exceeds total_deposited by 500_000.
    //
    //   on-chain balance   = 500_000   (donated, untracked)
    //   total_deposited    = 0         (vault's accounting)
    //   discrepancy        = +500_000  ← flash-loan guard must catch this
    mint(&env, &token, &vault_address, 500_000);

    // Attacker now tries to deposit into the price-manipulated vault.
    let result = vault.try_deposit(&attacker, &1_000_000);

    // Flash-loan guard must fire and return BalanceMismatch (error 12).
    assert_eq!(
        result,
        Err(Ok(VaultError::BalanceMismatch)),
        "expected BalanceMismatch when vault balance was inflated before deposit"
    );

    // Vault state must be completely unchanged: no shares minted, no assets
    // tracked.  The token transfer inside deposit() never executed, so the
    // attacker's external balance is also unaffected.
    assert_eq!(vault.total_assets(), 0, "total_assets must be 0 after blocked deposit attack");
    assert_eq!(
        vault.balance_of(&attacker),
        0,
        "attacker must hold 0 shares after blocked deposit attack"
    );
}

// ---------------------------------------------------------------------------
// Test 2 — Flash Loan Guard: withdraw entry-point
// ---------------------------------------------------------------------------

/// INVARIANT: token.balance(vault) == total_deposited
///
/// Attack scenario
/// ---------------
/// 1. A legitimate depositor seeds the vault (1_000_000 tokens / shares).
/// 2. Attacker inflates the vault's on-chain balance by donating 500_000
///    tokens directly to the vault address without going through harvest().
///    After this step: on-chain balance (1_500_000) > total_deposited (1_000_000).
/// 3. Attacker tries to call withdraw() — the inflated balance would skew
///    the redemption formula `shares * total_deposited / total_shares` to
///    pay out more tokens than the shares legitimately represent.
///
/// Expected outcome: guard detects balance_before ≠ total_deposited and
/// returns VaultError::BalanceMismatch before any state change or transfer.
#[test]
fn test_flash_loan_guard_blocks_withdraw() {
    let (env, vault, vault_address, admin, token) = setup();

    // Seed the vault with a legitimate depositor so total_shares > 0.
    let depositor = Address::generate(&env);
    mint(&env, &token, &depositor, 1_000_000);
    vault.deposit(&depositor, &1_000_000);

    // Sanity: vault is in consistent state before the attack.
    assert_eq!(vault.total_assets(), 1_000_000);
    assert_eq!(vault.balance_of(&depositor), 1_000_000);

    // --- ATTACK STEP ---
    // Inflate the vault balance without going through harvest() or deposit().
    //
    //   on-chain balance   = 1_500_000  (1_000_000 deposited + 500_000 donated)
    //   total_deposited    = 1_000_000
    //   discrepancy        = +500_000   ← guard must catch this
    mint(&env, &token, &vault_address, 500_000);

    // Depositor (acting as attacker) tries to withdraw while vault balance
    // is inflated.  The formula would yield 1_500_000 tokens for 1_000_000
    // shares — draining the vault beyond what was legitimately deposited.
    let shares = vault.balance_of(&depositor);
    let result = vault.try_withdraw(&depositor, &shares);

    assert_eq!(
        result,
        Err(Ok(VaultError::BalanceMismatch)),
        "expected BalanceMismatch when vault balance was inflated before withdraw"
    );

    // No state changes: depositor still holds their shares, accounting is
    // unchanged, no tokens were transferred out.
    assert_eq!(
        vault.balance_of(&depositor),
        1_000_000,
        "depositor shares must be intact after blocked withdraw attack"
    );
    assert_eq!(
        vault.total_assets(),
        1_000_000,
        "total_assets must be unchanged after blocked withdraw attack"
    );

    // Negative-control: a clean vault (no prior inflation) must allow
    // withdrawal normally, confirming the guard only fires on actual
    // discrepancies.
    let (env2, vault2, _vault_addr2, _admin2, token2) = setup();
    let user2 = Address::generate(&env2);
    mint(&env2, &token2, &user2, 2_000_000);
    vault2.deposit(&user2, &2_000_000);
    let s = vault2.balance_of(&user2);
    let redeemed = vault2.withdraw(&user2, &s);
    assert_eq!(redeemed, 2_000_000, "clean vault: full redemption must succeed");
}

// ---------------------------------------------------------------------------
// Test 3 — Flash Loan Guard: harvest entry-point
// ---------------------------------------------------------------------------

/// INVARIANT: token.balance(vault) == total_deposited
///
/// Attack scenario
/// ---------------
/// 1. A legitimate depositor seeds the vault (total_shares > 0 is required
///    for harvest to proceed past the ZeroShares guard).
/// 2. Attacker inflates the vault's on-chain balance by donating 200_000
///    tokens directly to the vault address.
///    After this step: on-chain balance (1_200_000) > total_deposited (1_000_000).
/// 3. Even the admin tries to call harvest() to inject 50_000 yield tokens.
///    With the balance already inconsistent, accepting the harvest would
///    permanently mis-price shares by double-counting the donated tokens.
///
/// Expected outcome: guard detects balance_before ≠ total_deposited and
/// returns VaultError::BalanceMismatch before any state change or transfer.
#[test]
fn test_flash_loan_guard_blocks_harvest() {
    let (env, vault, vault_address, admin, token) = setup();

    // Seed the vault so total_shares > 0; otherwise harvest returns ZeroShares
    // before reaching the flash-loan guard (test would pass for the wrong reason).
    let depositor = Address::generate(&env);
    mint(&env, &token, &depositor, 1_000_000);
    vault.deposit(&depositor, &1_000_000);

    assert_eq!(vault.total_assets(), 1_000_000);

    // --- ATTACK STEP ---
    // Inflate the vault's on-chain balance without going through harvest().
    //
    //   on-chain balance   = 1_200_000  (1_000_000 deposited + 200_000 donated)
    //   total_deposited    = 1_000_000
    //   discrepancy        = +200_000   ← guard must catch this
    mint(&env, &token, &vault_address, 200_000);

    // Admin (only authorised harvest caller since FIX-2) attempts a harvest.
    // Even a legitimate admin call must be blocked when the balance is already
    // inconsistent, as accepting it would bake the donation into total_deposited.
    mint(&env, &token, &admin, 50_000);
    let result = vault.try_harvest(&admin, &50_000);

    assert_eq!(
        result,
        Err(Ok(VaultError::BalanceMismatch)),
        "expected BalanceMismatch when vault balance was inflated before harvest"
    );

    // total_assets unchanged — harvest did not execute.
    assert_eq!(
        vault.total_assets(),
        1_000_000,
        "total_assets must be unchanged after blocked harvest attack"
    );

    // Existing depositor's share value must be unaffected.
    assert_eq!(
        vault.balance_of(&depositor),
        1_000_000,
        "depositor shares must be intact after blocked harvest attack"
    );

    // Negative-control: a clean harvest (no prior inflation) must succeed,
    // confirming the guard does not produce false positives under honest
    // keeper behaviour.
    let (env2, vault2, _vault_addr2, admin2, token2) = setup();
    let depositor2 = Address::generate(&env2);
    mint(&env2, &token2, &depositor2, 1_000_000);
    vault2.deposit(&depositor2, &1_000_000);

    // Honest harvest: admin transfers yield tokens into the vault via harvest().
    mint(&env2, &token2, &admin2, 300_000);
    vault2.harvest(&admin2, &300_000);

    // total_assets must increase by the post-fee yield amount.
    assert!(
        vault2.total_assets() > 1_000_000,
        "clean harvest must increase total_assets"
    );
}

// ---------------------------------------------------------------------------
// Test 4 — Negative control: no manipulation means no BalanceMismatch
// ---------------------------------------------------------------------------

/// Confirms that all three entry-points operate correctly when there is NO
/// balance inflation, i.e., the guard must not produce false positives.
///
/// A false-positive guard would permanently lock the vault even under honest
/// usage, making this just as important to verify as the true-positive cases.
#[test]
fn test_no_false_positive_on_honest_operations() {
    let (env, vault, _vault_address, admin, token) = setup();

    // --- Honest deposit ---
    let user = Address::generate(&env);
    mint(&env, &token, &user, 3_000_000);
    let minted = vault.deposit(&user, &3_000_000);
    assert_eq!(minted, 3_000_000, "honest deposit must succeed and return 1:1 shares");
    assert_eq!(vault.total_assets(), 3_000_000);

    // --- Honest harvest ---
    // Admin injects yield by calling harvest(), which pulls tokens via the
    // official entry-point so total_deposited is updated atomically with the
    // token transfer.  No balance discrepancy is ever created.
    mint(&env, &token, &admin, 600_000);
    vault.harvest(&admin, &600_000);

    // total_assets increases by post-fee yield; exact value depends on fee
    // configuration (default 10% perf fee), but it must exceed the deposit.
    let assets_after_harvest = vault.total_assets();
    assert!(
        assets_after_harvest > 3_000_000,
        "honest harvest must increase total_assets"
    );

    // --- Honest withdraw ---
    // User redeems all their shares; receives deposit + proportional yield.
    let shares = vault.balance_of(&user);
    let redeemed = vault.withdraw(&user, &shares);
    assert!(
        redeemed >= 3_000_000,
        "honest withdraw after yield must return at least the original deposit"
    );
}
