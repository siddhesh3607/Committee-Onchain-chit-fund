// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Native-AVAX rotating savings prototype. One prize per member.
/// Collateral covers ALL N contributions, including obligations after winning.
contract Chit {
    struct Member { uint256 collateral; uint256 credit; bool joined; bool won; }
    struct Round { address winner; uint256 discount; uint256 dividend; uint256 commission; uint256 slashed; }
    string public name;
    address public immutable foreman;
    uint256 public immutable capacity;
    uint256 public immutable contribution;
    uint256 public immutable roundLength;
    uint256 public immutable commissionBps;
    uint256 public immutable enrollmentDeadline;
    uint256 public currentRound;
    uint256 public roundStart;
    bool public started;
    bool public completed;
    bool public cancelled;
    address[] public members;
    mapping(address => Member) public standing;
    mapping(address => uint256) public claimable;
    mapping(uint256 => mapping(address => bool)) public paid;
    mapping(uint256 => mapping(address => bytes32)) public commitments;
    mapping(uint256 => mapping(address => bool)) public revealed;
    mapping(uint256 => mapping(address => uint256)) public bids;
    mapping(uint256 => Round) public rounds;
    uint256 private locked = 1;
    event Joined(address indexed member);
    event Started(uint256 timestamp);
    event Contributed(uint256 indexed round, address indexed member, uint256 cash, uint256 credit);
    event Committed(uint256 indexed round, address indexed member, bytes32 commitment);
    event Revealed(uint256 indexed round, address indexed member, uint256 discount);
    event Slashed(uint256 indexed round, address indexed member, uint256 amount);
    event Settled(uint256 indexed round, address indexed winner, uint256 discount, uint256 dividend, uint256 commission, uint256 slashed);
    event Withdrawn(address indexed member, address indexed to, uint256 amount);
    event Cancelled();
    modifier nonReentrant() { require(locked == 1, "Reentrant"); locked = 2; _; locked = 1; }
    constructor(string memory name_, address foreman_, uint256 n, uint256 c, uint256 length, uint256 fee) {
        require(bytes(name_).length > 0 && bytes(name_).length <= 64, "Invalid name");
        require(foreman_ != address(0) && n >= 2 && n <= 32 && c > 0 && c <= 1000 ether, "Invalid terms");
        require(length >= 30 && length <= 365 days && fee <= 1000, "Invalid timing/fee");
        name = name_; foreman = foreman_; capacity = n; contribution = c;
        roundLength = length; commissionBps = fee; enrollmentDeadline = block.timestamp + 1 days;
    }
    function memberCount() external view returns (uint256) { return members.length; }
    function collateralRequired() public view returns (uint256) { return capacity * contribution; }
    function pot() public view returns (uint256) { return capacity * contribution; }
    /// 0 enrollment, 1 contribution, 2 commit, 3 reveal, 4 settle, 5 complete, 6 cancelled.
    function phase() public view returns (uint256) {
        if (cancelled) return 6; if (completed) return 5; if (!started) return 0;
        uint256 elapsed = block.timestamp - roundStart;
        if (elapsed < roundLength / 3) return 1;
        if (elapsed < roundLength * 2 / 3) return 2;
        if (elapsed < roundLength) return 3; return 4;
    }
    function due(address member) public view returns (uint256) {
        if (!standing[member].joined || !started || completed || paid[currentRound][member]) return 0;
        uint256 credit = standing[member].credit;
        return credit >= contribution ? 0 : contribution - credit;
    }
    function join() external payable {
        require(!started && !cancelled && block.timestamp < enrollmentDeadline, "Enrollment closed");
        require(!standing[msg.sender].joined && members.length < capacity, "Cannot join");
        require(msg.value == collateralRequired(), "Exact collateral required");
        standing[msg.sender] = Member(msg.value, 0, true, false); members.push(msg.sender); emit Joined(msg.sender);
    }
    function start() external {
        require(!started && !cancelled && block.timestamp < enrollmentDeadline && members.length == capacity, "Cannot start");
        started = true; currentRound = 1; roundStart = block.timestamp; emit Started(block.timestamp);
    }
    function cancel() external {
        require(!started && !cancelled && block.timestamp >= enrollmentDeadline, "Cannot cancel");
        cancelled = true; emit Cancelled();
    }
    function contribute() external payable {
        require(phase() == 1 && standing[msg.sender].joined && !paid[currentRound][msg.sender], "Cannot contribute");
        require(msg.value == due(msg.sender), "Exact due required");
        uint256 used = _useCredit(msg.sender); paid[currentRound][msg.sender] = true;
        emit Contributed(currentRound, msg.sender, msg.value, used);
    }
    function commitmentFor(address member, uint256 discount, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, currentRound, member, discount, salt));
    }
    function commitBid(bytes32 commitment) external {
        require(phase() == 2 && paid[currentRound][msg.sender] && !standing[msg.sender].won, "Cannot bid");
        require(commitment != bytes32(0) && commitments[currentRound][msg.sender] == bytes32(0), "Invalid commitment");
        commitments[currentRound][msg.sender] = commitment; emit Committed(currentRound, msg.sender, commitment);
    }
    function revealBid(uint256 discount, bytes32 salt) external {
        require(phase() == 3 && !revealed[currentRound][msg.sender] && commitments[currentRound][msg.sender] != bytes32(0), "Cannot reveal");
        require(discount < pot() && commitments[currentRound][msg.sender] == commitmentFor(msg.sender, discount, salt), "Invalid reveal");
        revealed[currentRound][msg.sender] = true; bids[currentRound][msg.sender] = discount;
        emit Revealed(currentRound, msg.sender, discount);
    }
    function _useCredit(address member) private returns (uint256 used) {
        used = standing[member].credit; if (used > contribution) used = contribution;
        standing[member].credit -= used;
    }
    /// @notice Permissionless, bounded settlement. No external calls to recipients.
    function settle() external {
        require(phase() == 4, "Cannot settle");
        address winner; uint256 best; uint256 slashed;
        for (uint256 i; i < members.length; ++i) {
            address m = members[i];
            if (!paid[currentRound][m]) {
                uint256 shortfall = contribution - _useCredit(m);
                standing[m].collateral -= shortfall; slashed += shortfall;
                paid[currentRound][m] = true; emit Slashed(currentRound, m, shortfall);
            }
            if (!standing[m].won && revealed[currentRound][m] && (winner == address(0) || bids[currentRound][m] > best)) {
                winner = m; best = bids[currentRound][m];
            }
        }
        // No reveals: deterministic zero-discount award in join order prevents deadlock.
        if (winner == address(0)) for (uint256 i; i < members.length; ++i) {
            if (!standing[members[i]].won) { winner = members[i]; break; }
        }
        standing[winner].won = true;
        uint256 fee = best * commissionBps / 10000;
        uint256 dividend = (best - fee) / (capacity - 1);
        // Division dust goes to the foreman; all wei remain accounted for.
        fee = best - dividend * (capacity - 1);
        claimable[winner] += pot() - best; claimable[foreman] += fee;
        for (uint256 i; i < members.length; ++i) if (members[i] != winner) standing[members[i]].credit += dividend;
        rounds[currentRound] = Round(winner, best, dividend, fee, slashed);
        emit Settled(currentRound, winner, best, dividend, fee, slashed);
        if (currentRound == capacity) completed = true;
        else { ++currentRound; roundStart = block.timestamp; }
    }
    function withdraw(address payable to) external nonReentrant {
        require(to != address(0), "Invalid recipient");
        uint256 amount = claimable[msg.sender]; claimable[msg.sender] = 0;
        if (completed || cancelled) {
            amount += standing[msg.sender].collateral + standing[msg.sender].credit;
            standing[msg.sender].collateral = 0; standing[msg.sender].credit = 0;
        }
        require(amount > 0, "Nothing to withdraw");
        (bool ok,) = to.call{value: amount}(""); require(ok, "Transfer failed");
        emit Withdrawn(msg.sender, to, amount);
    }
}
