// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "./Chit.sol";
contract ChitFactory {
    address[] public chits;
    event ChitCreated(address indexed chit, address indexed foreman, string name);
    function createChit(string calldata name, uint256 members, uint256 contribution, uint256 roundLength, uint256 commissionBps) external returns (address chit) {
        chit = address(new Chit(name, msg.sender, members, contribution, roundLength, commissionBps));
        chits.push(chit); emit ChitCreated(chit, msg.sender, name);
    }
    function chitCount() external view returns (uint256) { return chits.length; }
}
