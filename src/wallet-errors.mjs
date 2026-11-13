// Only an explicit wallet rejection is proof that no transaction was submitted.
// Unknown RPC/receipt failures must keep the bid preimage for later recovery.
export function isUserRejection(error) {
  const visited=new Set();let current=error;
  while(current&&typeof current==='object'&&!visited.has(current)){
    visited.add(current);
    if(current.code===4001||current.name==='UserRejectedRequestError')return true;
    current=current.cause;
  }
  return false;
}
export function shouldDiscardBid(error, hasPriorPreimage = false) {
  // Rejecting a retry does not prove that an earlier attempt wasn't broadcast.
  return !hasPriorPreimage && isUserRejection(error);
}
