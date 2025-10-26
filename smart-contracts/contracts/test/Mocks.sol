// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../AIAgentController.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20
 * @dev Mock ERC20 token for testing
 */
contract MockERC20 is ERC20 {
    uint8 private _decimals;
    
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        _decimals = decimals_;
        _mint(msg.sender, initialSupply);
    }
    
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}

/**
 * @title MockPyth
 * @dev Mock Pyth oracle for testing
 */
contract MockPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }
    
    mapping(bytes32 => Price) private prices;
    uint256 private updateFee = 0.01 ether;
    
    event PriceFeedUpdate(bytes32 indexed id, int64 price, uint64 conf, uint256 publishTime);
    
    function updatePriceFeeds(bytes[] calldata updateData) external payable {
        require(msg.value >= updateFee, "Insufficient fee");
        
        // Mock update - in real implementation, this would parse the updateData
        // For testing, we'll update some mock prices
        
        // Mock PYUSD/USD price
        bytes32 pyusdId = 0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722;
        prices[pyusdId] = Price({
            price: 100000000, // $1.00 (8 decimals)
            conf: 100000,     // $0.001 confidence
            expo: -8,
            publishTime: block.timestamp
        });
        emit PriceFeedUpdate(pyusdId, 100000000, 100000, block.timestamp);
        
        // Mock ETH/USD price
        bytes32 ethId = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
        prices[ethId] = Price({
            price: 200000000000, // $2000.00 (8 decimals)
            conf: 100000000,     // $1.00 confidence
            expo: -8,
            publishTime: block.timestamp
        });
        emit PriceFeedUpdate(ethId, 200000000000, 100000000, block.timestamp);
        
        // Mock USDC/USD price
        bytes32 usdcId = 0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a;
        prices[usdcId] = Price({
            price: 100000000, // $1.00 (8 decimals)
            conf: 50000,      // $0.0005 confidence
            expo: -8,
            publishTime: block.timestamp
        });
        emit PriceFeedUpdate(usdcId, 100000000, 50000, block.timestamp);
    }
    
    function getPrice(bytes32 id) external view returns (Price memory) {
        return prices[id];
    }
    
    function getUpdateFee(bytes[] calldata) external view returns (uint256) {
        return updateFee;
    }
    
    function setPrice(bytes32 id, int64 price, int32 expo) external {
        prices[id] = Price({
            price: price,
            conf: uint64(uint256(int256(price)) / 1000), // 0.1% of price
            expo: expo,
            publishTime: block.timestamp
        });
    }
    
    function setUpdateFee(uint256 fee) external {
        updateFee = fee;
    }
}