// Pure simulation of the deployed contract's accounting. All money is integer wei.
export const CONTRIBUTION = 10n ** 16n;
export const CAPACITY = 5;
export const NAMES = ['Asha', 'Kabir', 'Meera', 'Dev', 'Zoya'];
export function splitDiscount(pot, discount, members, feeBps = 500n) {
  if (members < 2 || !Number.isInteger(members) || pot <= 0n || discount < 0n || discount >= pot || feeBps < 0n || feeBps > 1000n) throw new Error('Invalid auction terms');
  const baseFee = discount * feeBps / 10000n;
  const dividend = (discount - baseFee) / BigInt(members - 1);
  const commission = discount - dividend * BigInt(members - 1);
  return { prize: pot - discount, dividend, commission };
}
export function netPayment(credit, contribution = CONTRIBUTION) {
  return credit >= contribution ? 0n : contribution - credit;
}
export function makeSimulation() {
  return {
    round: 1, phase: 'contribute', pool: 0n, commission: 0n, balance: CONTRIBUTION * 25n,
    members: NAMES.map((name, id) => ({ id, name, credit: 0n, collateral: CONTRIBUTION * 5n, prize: 0n, cashPaid: 0n, paid: false, won: false, committed: false, revealed: false, bid: 0n })),
    history: [], events: [{ round: 1, title: 'Five friends. One shared pot.', detail: 'Illustrative collateral deposits: 0.05 AVAX per member.' }], withhold: false,
  };
}
export function advanceSimulation(previous, options = {}) {
  if (previous.phase === 'complete') return previous;
  const state = { ...previous, members: previous.members.map(m => ({ ...m })), history: [...previous.history], events: [...previous.events] };
  const add = (title, detail) => state.events.unshift({ round: state.round, title, detail });
  if (state.phase === 'contribute') {
    for (const m of state.members) {
      if (options.missRoundTwo && state.round === 2 && m.id === 4) continue;
      const due = netPayment(m.credit), used = CONTRIBUTION - due;
      m.credit -= used; m.cashPaid += due; m.paid = true;
      state.balance += due; state.pool += CONTRIBUTION;
    }
    state.phase = 'commit';
    add('Contributions collected.', state.members.every(m => m.paid) ? 'Dividend credits were applied before any cash payment.' : 'Zoya missed round two. Her obligation is still secured.');
  } else if (state.phase === 'commit') {
    for (const m of state.members) if (m.paid && !m.won) {
      m.committed = true;
      m.bid = options.customBid !== undefined && m.id === state.members.find(x => x.paid && !x.won)?.id
        ? options.customBid : (10000n - BigInt((m.id - state.round + 1 + 5) % 5) * 1500n) * 10n ** 12n;
      if (m.bid < 0n || m.bid >= CONTRIBUTION * 5n) throw new Error('Discount must be below the pot');
    }
    state.withhold = !!options.withhold; state.phase = 'reveal';
    add('Bids are sealed.', 'Eligible members have committed. Nobody can change their sealed bid.');
  } else if (state.phase === 'reveal') {
    for (const m of state.members) m.revealed = m.committed && !state.withhold;
    state.phase = 'settle';
    add(state.withhold ? 'Nobody revealed.' : 'The bids are out.', state.withhold ? 'Settlement will use the zero-discount fallback in join order.' : 'The highest revealed discount wins; ties use join order.');
  } else if (state.phase === 'settle') {
    let slashed = 0n;
    for (const m of state.members) if (!m.paid) {
      const shortfall = netPayment(m.credit);
      m.credit -= CONTRIBUTION - shortfall; m.collateral -= shortfall;
      slashed += shortfall; state.pool += CONTRIBUTION; m.paid = true;
    }
    const candidates = state.members.filter(m => m.revealed && !m.won);
    let winner = candidates.reduce((best, m) => !best || m.bid > best.bid ? m : best, undefined);
    const discount = winner ? winner.bid : 0n;
    winner ??= state.members.find(m => !m.won);
    const split = splitDiscount(CONTRIBUTION * 5n, discount, 5);
    winner.won = true; winner.prize += split.prize; state.commission += split.commission;
    for (const m of state.members) if (m.id !== winner.id) m.credit += split.dividend;
    state.pool = 0n;
    const result = { round: state.round, winner: winner.id, name: winner.name, discount, slashed, ...split };
    state.history.push(result); state.phase = 'result';
    add(`${winner.name} takes the pot.`, slashed > 0n ? 'Missed payment covered. The full pot remains funded.' : 'Prize allocated. Dividends credited to the other four members.');
  } else if (state.phase === 'result') {
    if (state.round === 5) { state.phase = 'complete'; add('Everyone had their turn.', 'All remaining collateral and credits are now eligible for withdrawal.'); }
    else {
      state.round++; state.phase = 'contribute';
      for (const m of state.members) { m.paid = false; m.committed = false; m.revealed = false; m.bid = 0n; }
      add(`Round ${state.round} starts.`, 'Existing dividends reduce the next cash contributions.');
    }
  }
  return state;
}
export function simulationLiabilities(state) {
  return state.pool + state.commission + state.members.reduce((sum, m) => sum + m.collateral + m.credit + m.prize, 0n);
}
export function receiptSvg({ circle, round, winner, prize, dividend, slashed, simulation }) {
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="#11120f"/><circle cx="980" cy="70" r="380" fill="none" stroke="#32382a" stroke-width="60"/><circle cx="980" cy="70" r="280" fill="none" stroke="#c9f76b" stroke-width="2"/><g font-family="Arial,sans-serif"><text x="80" y="100" font-size="36" fill="#c9f76b" font-weight="bold">committee / ROUND ${esc(round)}</text><text x="80" y="185" font-size="20" fill="#9a9e91">${esc(Array.from(String(circle)).slice(0, 80).join(''))}</text><text x="80" y="330" font-size="70" fill="#f4f5eb" font-weight="bold">THE POT IS YOURS.</text><text x="80" y="430" font-size="32" fill="#a8a4eb">${esc(winner)}</text><text x="80" y="570" font-size="100" fill="#c9f76b" font-weight="bold">${esc(prize)} AVAX</text><path d="M80 650H1000" stroke="#35382c"/><text x="80" y="730" font-size="22" fill="#9a9e91">DIVIDEND / OTHER MEMBER</text><text x="80" y="785" font-size="36" fill="#f4f5eb">${esc(dividend)} AVAX</text><text x="80" y="860" font-size="22" fill="#9a9e91">COLLATERAL USED</text><text x="80" y="910" font-size="36" fill="#f4f5eb">${esc(slashed)} AVAX</text><text x="80" y="1010" font-size="19" fill="#b6b5a4">${simulation ? 'SIMULATION / NO ON-CHAIN TRANSACTION' : 'AVALANCHE FUJI / TEST AVAX ONLY'}</text></g></svg>`;
}
