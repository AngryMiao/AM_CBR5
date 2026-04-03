use voice_core::RuntimePhase;

#[test]
fn runtime_phase_defaults_to_idle() {
  assert_eq!(RuntimePhase::default().as_str(), "idle");
}
