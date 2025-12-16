export class BackendAdapter {
  static toLegacyPayload(tree, { amount=null, flags=['--explain','--audit'], applyBlocks=false } = {}) {
    const heirs = tree.toHeirs(applyBlocks);
    const payload = { heirs, cli_flags: flags };
    if (amount!==null) { payload.amount = amount; payload.estate_value = amount; }
    return payload;
  }
}
