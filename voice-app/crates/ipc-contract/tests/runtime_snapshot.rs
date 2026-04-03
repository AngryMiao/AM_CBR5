use ipc_contract::RuntimeSnapshot;

#[test]
fn default_runtime_snapshot_is_idle() {
  let snapshot = RuntimeSnapshot::default();
  assert_eq!(snapshot.phase, "idle");
}
