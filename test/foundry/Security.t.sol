// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "../../contracts/ChitFactory.sol";
interface VmSecurity {
    function deal(address,uint256) external;
    function prank(address) external;
    function warp(uint256) external;
    function chainId(uint256) external;
    function expectRevert() external;
}
contract HostileMember {
    Chit public chit;
    bool public attempted;
    bool public reentered;
    bool public rejectPayment;
    constructor(Chit target) { chit=target; }
    function join() external { chit.join{value:chit.collateralRequired()}(); }
    function reject(bool value) external { rejectPayment=value; }
    function withdraw(address payable to) external { chit.withdraw(to); }
    receive() external payable {
        require(!rejectPayment,"Receiver rejects funds");
        if(!attempted){attempted=true;(reentered,)=address(chit).call(abi.encodeCall(Chit.withdraw,(payable(address(this)))));}
    }
}
contract SecurityTest {
    VmSecurity constant vm=VmSecurity(address(uint160(uint256(keccak256("hevm cheat code")))));
    address a=address(0xA);address b=address(0xB);address c=address(0xC);
    Chit chit;
    function setUp() public {chit=_circle(3,120,0.01 ether);}
    function _circle(uint256 n,uint256 length,uint256 value) internal returns(Chit target){
        target=new Chit("Security case",address(this),n,value,length,500);
        for(uint256 i;i<n;i++){address m=_member(i);vm.deal(m,value*n+10 ether);vm.prank(m);target.join{value:value*n}();}
        target.start();
    }
    function _member(uint256 i) internal view returns(address){if(i==0)return a;if(i==1)return b;if(i==2)return c;return address(uint160(0x100+i));}
    function _accounting(Chit target) internal view {
        uint256 liabilities=target.claimable(address(this));
        for(uint256 i;i<target.capacity();i++){
            address m=target.members(i);(uint256 collateral,uint256 credit,,)=target.standing(m);
            liabilities+=collateral+credit+target.claimable(m);
        }
        require(address(target).balance==liabilities,"Balance/liability mismatch");
    }
    function testExactPhaseBoundaries() public {
        uint256 start=chit.roundStart();vm.warp(start+39);require(chit.phase()==1,"39s contribute");
        vm.warp(start+40);require(chit.phase()==2,"40s commit");vm.expectRevert();vm.prank(a);chit.contribute{value:0.01 ether}();
        vm.warp(start+79);require(chit.phase()==2,"79s commit");vm.warp(start+80);require(chit.phase()==3,"80s reveal");
        vm.warp(start+119);require(chit.phase()==3,"119s reveal");vm.expectRevert();chit.settle();
        vm.warp(start+120);require(chit.phase()==4,"120s settle");chit.settle();require(chit.phase()==1,"Next round resets clock");
    }
    function testNonDivisibleRoundLengthHasNoTimingGap() public {
        Chit odd=_circle(2,31,1 wei);uint256 start=odd.roundStart();
        vm.warp(start+9);require(odd.phase()==1,"9s");vm.warp(start+10);require(odd.phase()==2,"10s");
        vm.warp(start+19);require(odd.phase()==2,"19s");vm.warp(start+20);require(odd.phase()==3,"20s");
        vm.warp(start+30);require(odd.phase()==3,"30s");vm.warp(start+31);odd.settle();_accounting(odd);
    }
    function testCommitmentsCannotReplayAcrossMembersContractsChainsOrRounds() public {
        vm.prank(a);chit.contribute{value:0.01 ether}();vm.prank(b);chit.contribute{value:0.01 ether}();
        vm.warp(chit.roundStart()+40);bytes32 salt=keccak256("domain");bytes32 original=chit.commitmentFor(a,1 wei,salt);
        require(original!=chit.commitmentFor(b,1 wei,salt),"Member domain");
        Chit other=new Chit("other",address(this),3,0.01 ether,120,500);require(original!=other.commitmentFor(a,1 wei,salt),"Contract domain");
        uint256 chain=block.chainid;vm.chainId(chain+1);require(original!=chit.commitmentFor(a,1 wei,salt),"Chain domain");vm.chainId(chain);
        vm.prank(b);chit.commitBid(original);vm.warp(chit.roundStart()+80);vm.expectRevert();vm.prank(b);chit.revealBid(1 wei,salt);
        vm.warp(chit.roundStart()+120);chit.settle();require(original!=chit.commitmentFor(a,1 wei,salt),"Round domain");
        vm.prank(b);chit.contribute{value:0.01 ether}();vm.warp(chit.roundStart()+40);vm.prank(b);chit.commitBid(original);
        vm.warp(chit.roundStart()+80);vm.expectRevert();vm.prank(b);chit.revealBid(1 wei,salt);
    }
    function testReentrantReceiverCannotWithdrawTwice() public {
        Chit target=new Chit("Reentrancy",address(this),2,0.01 ether,120,500);HostileMember attacker=new HostileMember(target);
        vm.deal(address(attacker),1 ether);attacker.join();vm.prank(b);target.join{value:0.02 ether}();target.start();
        vm.warp(target.roundStart()+120);target.settle();attacker.withdraw(payable(address(attacker)));
        require(attacker.attempted()&&!attacker.reentered(),"Reentrant withdrawal succeeded");require(target.claimable(address(attacker))==0,"Prize not cleared");
        vm.warp(target.roundStart()+120);target.settle();vm.prank(b);target.withdraw(payable(b));require(address(target).balance==0,"Remaining balance");
    }
    function testRejectingReceiverCannotBlockCircleOrLoseItsPrize() public {
        Chit target=new Chit("Rejector",address(this),2,0.01 ether,120,500);HostileMember receiver=new HostileMember(target);
        vm.deal(address(receiver),1 ether);receiver.join();vm.prank(b);target.join{value:0.02 ether}();target.start();
        vm.warp(target.roundStart()+120);target.settle();receiver.reject(true);uint256 prize=target.claimable(address(receiver));
        vm.expectRevert();receiver.withdraw(payable(address(receiver)));require(target.claimable(address(receiver))==prize,"Failed transfer lost prize");
        vm.warp(target.roundStart()+120);target.settle();receiver.withdraw(payable(a));vm.prank(b);target.withdraw(payable(b));require(address(target).balance==0,"Circle blocked");
    }
    function testFullyJoinedButExpiredEnrollmentCanRefundEveryone() public {
        Chit target=new Chit("Expired",address(this),2,0.01 ether,120,500);vm.prank(a);target.join{value:0.02 ether}();vm.prank(b);target.join{value:0.02 ether}();
        vm.warp(target.enrollmentDeadline());vm.expectRevert();target.start();target.cancel();
        vm.prank(a);target.withdraw(payable(a));vm.prank(b);target.withdraw(payable(b));require(address(target).balance==0,"Refund balance");
        vm.expectRevert();target.cancel();vm.expectRevert();target.start();
    }
    function testMaximum32MembersAllDefaultStillCompletes() public {
        Chit maximum=_circle(32,30,1 wei);uint256 largest;
        for(uint256 round;round<32;round++){
            vm.warp(maximum.roundStart()+30);uint256 beforeGas=gasleft();maximum.settle();uint256 used=beforeGas-gasleft();if(used>largest)largest=used;
            _accounting(maximum);
        }
        require(maximum.completed(),"32-member completion");require(largest<4_000_000,"Settlement exceeds 4m gas test budget");
        for(uint256 i;i<32;i++){address m=_member(i);(uint256 collateral,, ,bool won)=maximum.standing(m);require(collateral==0&&won,"Default lifecycle");vm.prank(m);maximum.withdraw(payable(m));}
        require(address(maximum).balance==0,"Final dust");
    }
    function testZeroRecipientAndDoubleWithdrawalRevert() public {
        vm.warp(chit.roundStart()+120);chit.settle();uint256 prize=chit.claimable(a);
        vm.expectRevert();vm.prank(a);chit.withdraw(payable(address(0)));require(chit.claimable(a)==prize,"Zero recipient altered claim");
        vm.prank(a);chit.withdraw(payable(a));vm.expectRevert();vm.prank(a);chit.withdraw(payable(a));_accounting(chit);
    }
    function testFactoryGettersAndConstructorRejectionBounds() public {
        ChitFactory factory=new ChitFactory();address created=factory.createChit("Valid",2,1 wei,30,0);
        require(factory.chitCount()==1&&factory.chits(0)==created,"Factory getters");
        Chit empty=Chit(created);require(empty.memberCount()==0&&empty.phase()==0&&empty.due(a)==0,"Enrollment views");
        vm.expectRevert();factory.createChit("",2,1 wei,30,0);
        vm.expectRevert();factory.createChit(new string(65),2,1 wei,30,0);
        vm.expectRevert();new Chit("x",address(0),2,1 wei,30,0);
        vm.expectRevert();factory.createChit("x",1,1 wei,30,0);
        vm.expectRevert();factory.createChit("x",33,1 wei,30,0);
        vm.expectRevert();factory.createChit("x",2,0,30,0);
        vm.expectRevert();factory.createChit("x",2,1000 ether+1,30,0);
        vm.expectRevert();factory.createChit("x",2,1 wei,29,0);
        vm.expectRevert();factory.createChit("x",2,1 wei,365 days+1,0);
        vm.expectRevert();factory.createChit("x",2,1 wei,30,1001);
    }
    function testMembershipAndBidRejectionBranches() public {
        vm.expectRevert();vm.prank(a);chit.join{value:0.03 ether}();
        vm.expectRevert();chit.start();vm.expectRevert();chit.cancel();
        vm.expectRevert();vm.prank(address(0x999));chit.contribute();
        vm.expectRevert();vm.prank(b);chit.contribute{value:1 wei}();
        vm.prank(a);chit.contribute{value:0.01 ether}();vm.expectRevert();vm.prank(a);chit.contribute{value:0.01 ether}();
        uint256 start=chit.roundStart();vm.warp(start+40);
        vm.expectRevert();vm.prank(b);chit.commitBid(keccak256("unpaid"));
        vm.expectRevert();vm.prank(a);chit.commitBid(bytes32(0));
        bytes32 salt=keccak256("valid");bytes32 bid=chit.commitmentFor(a,1 wei,salt);vm.prank(a);chit.commitBid(bid);
        vm.expectRevert();vm.prank(a);chit.commitBid(bid);vm.expectRevert();vm.prank(a);chit.revealBid(1 wei,salt);
        vm.warp(start+80);vm.expectRevert();vm.prank(b);chit.revealBid(1 wei,salt);
        vm.expectRevert();vm.prank(a);chit.revealBid(2 wei,salt);vm.expectRevert();vm.prank(a);chit.revealBid(1 wei,bytes32(0));
        vm.prank(a);chit.revealBid(1 wei,salt);vm.expectRevert();vm.prank(a);chit.revealBid(1 wei,salt);
        vm.warp(start+120);vm.expectRevert();vm.prank(a);chit.commitBid(bid);vm.expectRevert();vm.prank(a);chit.revealBid(1 wei,salt);
        chit.settle();_accounting(chit);
    }
    function testEnrollmentCancellationPhaseAndDuplicateJoin() public {
        Chit target=new Chit("Enrollment",address(this),2,0.01 ether,120,0);
        vm.expectRevert();target.start();vm.expectRevert();target.cancel();
        vm.expectRevert();vm.prank(a);target.join{value:1 wei}();
        vm.prank(a);target.join{value:0.02 ether}();vm.expectRevert();vm.prank(a);target.join{value:0.02 ether}();
        vm.prank(b);target.join{value:0.02 ether}();vm.expectRevert();vm.prank(c);target.join{value:0.02 ether}();
        require(target.memberCount()==2,"Member count");vm.warp(target.enrollmentDeadline());target.cancel();require(target.phase()==6,"Cancelled phase");
        vm.expectRevert();vm.prank(c);target.join{value:0.02 ether}();vm.prank(a);target.withdraw(payable(a));vm.prank(b);target.withdraw(payable(b));
        require(address(target).balance==0,"Cancelled refund");
    }
    function testLargeCreditCoversMissedPaymentWithoutCollateralSlash() public {
        Chit target=_circle(2,120,0.01 ether);vm.prank(a);target.contribute{value:0.01 ether}();vm.prank(b);target.contribute{value:0.01 ether}();
        uint256 start=target.roundStart();vm.warp(start+40);bytes32 salt=keccak256("large");bytes32 bid=target.commitmentFor(a,0.019 ether,salt);
        vm.prank(a);target.commitBid(bid);vm.warp(start+80);vm.prank(a);target.revealBid(0.019 ether,salt);vm.warp(start+120);target.settle();
        require(target.due(b)==0,"Credit should cover due");vm.warp(target.roundStart()+120);target.settle();
        (uint256 collateral,uint256 credit,,)=target.standing(b);require(collateral==0.02 ether&&credit==0.00805 ether,"Credit carry or slash incorrect");
        require(target.phase()==5&&target.due(b)==0,"Completed phase");_accounting(target);
    }
    function testFuzzMixedPaymentsRevealsAndEarlyWithdrawals(uint256 seed) public {
        for(uint256 round;round<3;round++){
            uint256 start=chit.roundStart();
            for(uint256 i;i<3;i++)if(uint256(keccak256(abi.encode(seed,round,i,"pay")))%2==0){
                address m=_member(i);uint256 due=chit.due(m);vm.prank(m);chit.contribute{value:due}();
            }
            vm.warp(start+40);bytes32[3] memory salts;uint256[3] memory discounts;
            for(uint256 i;i<3;i++){
                address m=_member(i);(,,,bool won)=chit.standing(m);if(won||!chit.paid(chit.currentRound(),m))continue;
                salts[i]=keccak256(abi.encode(seed,round,i,"salt"));discounts[i]=uint256(keccak256(abi.encode(seed,round,i)))%chit.pot();
                bytes32 bid=chit.commitmentFor(m,discounts[i],salts[i]);vm.prank(m);chit.commitBid(bid);
            }
            vm.warp(start+80);for(uint256 i;i<3;i++)if(salts[i]!=bytes32(0)&&uint256(keccak256(abi.encode(seed,round,i,"reveal")))%2==0){vm.prank(_member(i));chit.revealBid(discounts[i],salts[i]);}
            vm.warp(start+120);chit.settle();_accounting(chit);
            for(uint256 i;i<3;i++)if(chit.claimable(_member(i))>0&&((seed>>i)&1)==1){vm.prank(_member(i));chit.withdraw(payable(_member(i)));_accounting(chit);}
        }
        require(chit.completed(),"Fuzz completion");
        for(uint256 i;i<3;i++){
            address m=_member(i);(uint256 collateral,uint256 credit,,)=chit.standing(m);
            if(collateral+credit+chit.claimable(m)>0){vm.prank(m);chit.withdraw(payable(m));}
        }
        if(chit.claimable(address(this))>0)chit.withdraw(payable(a));require(address(chit).balance==0,"Fuzz funds stuck");
    }
}
