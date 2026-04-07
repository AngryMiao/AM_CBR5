use rustls::crypto::CryptoProvider;

use asr_core::ensure_rustls_crypto_provider_installed;

#[test]
fn rustls_provider_is_installed_before_secure_connections() {
    ensure_rustls_crypto_provider_installed().expect("provider install should succeed");
    assert!(CryptoProvider::get_default().is_some());
}
