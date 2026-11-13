// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "../../contracts/ChitFactory.sol";
interface Vm { function deal(address,uint256) external; function prank(address) external; function warp(uint256) external; function expectRevert() external; }
contract ChitTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    Chit chit;
    address a = address(0xA); address b = address(0xB); address c = address(0xC);
    function setUp() public {
        ChitFactory factory = new ChitFactory(); chit = Chit(factory.createChit("Foundry",3,0.01 ether,120,500));
        vm.deal(a,1 ether); vm.deal(b,1 ether); vm.deal(c,1 ether);
        vm.prank(a);chit.join{value:0.03 ether}();vm.prank(b);chit.join{value:0.03 ether}();vm.prank(c);chit.join{value:0.03 ether}();chit.start();
    }
    function testAuctionDividendAndDefault() public {
        vm.prank(a);chit.contribute{value:0.01 ether}();vm.prank(b);chit.contribute{value:0.01 ether}();
        uint256 start=chit.roundStart();vm.warp(start+40);bytes32 salt=keccak256("salt");bytes32 bidHash=chit.commitmentFor(a,0.006 ether,salt);
        vm.prank(a);chit.commitBid(bidHash);vm.warp(start+80);vm.prank(a);chit.revealBid(0.006 ether,salt);
        vm.warp(start+120);chit.settle();
        require(chit.claimable(a)==0.024 ether,"prize");(uint256 collateral,uint256 credit,,)=chit.standing(c);
        require(collateral==0.02 ether,"slash");require(credit==0.00285 ether,"dividend");require(chit.due(c)==0.00715 ether,"reduced due");
    }
    function testNoRevealsCompletesAndRefunds() public {
        for(uint256 i;i<3;i++){vm.warp(chit.roundStart()+120);chit.settle();}
        require(chit.completed(),"completion");vm.prank(a);chit.withdraw(payable(a));vm.prank(b);chit.withdraw(payable(b));vm.prank(c);chit.withdraw(payable(c));require(address(chit).balance==0,"solvent");
    }
    function testFuzzDiscountAccounting(uint96 raw) public {
        uint256 discount=uint256(raw)%0.03 ether;
        vm.prank(a);chit.contribute{value:0.01 ether}();uint256 start=chit.roundStart();vm.warp(start+40);
        bytes32 salt=keccak256("fuzz");bytes32 bidHash=chit.commitmentFor(a,discount,salt);vm.prank(a);chit.commitBid(bidHash);
        vm.warp(start+80);vm.prank(a);chit.revealBid(discount,salt);vm.warp(start+120);chit.settle();
        uint256 liabilities=chit.claimable(a)+chit.claimable(address(this));
        (uint256 ac,uint256 ad,,)=chit.standing(a);(uint256 bc,uint256 bd,,)=chit.standing(b);(uint256 cc,uint256 cd,,)=chit.standing(c);
        require(address(chit).balance==liabilities+ac+ad+bc+bd+cc+cd,"accounting");
    }
}
