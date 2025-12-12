// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/AggregatorV3Interface.sol";

/**
 * @title PredictionNFT
 * @dev NFT contract for prediction replay NFTs using QIE Oracle
 * QIE Oracle follows Chainlink AggregatorV3Interface standard
 */
contract PredictionNFT {
    // Oracle addresses for QIE network
    mapping(string => address) public oracleAddresses;
    
    // Asset symbols mapped to oracle addresses
    string[] public supportedAssets = ["BTC", "ETH", "XRP", "SOL", "QIE"];
    
    struct Prediction {
        string asset;
        uint256 entryPrice;
        uint256 resolveTime;
        string predictionType; // "UP" or "DOWN"
        bool resolved;
        uint256 resultPrice;
        string outcome; // "WIN" or "LOSE"
    }
    
    mapping(uint256 => Prediction) public predictions;
    uint256 public tokenCounter;
    
    event PredictionMinted(uint256 indexed tokenId, string asset, uint256 entryPrice, uint256 resolveTime);
    event PredictionResolved(uint256 indexed tokenId, string outcome, uint256 resultPrice);
    
    constructor() {
        // Initialize QIE Oracle addresses
        oracleAddresses["BTC"] = 0x9E596d809a20A272c788726f592c0d1629755440;
        oracleAddresses["ETH"] = 0x4bb7012Fbc79fE4Ae9B664228977b442b385500d;
        oracleAddresses["XRP"] = 0x804582B1f8Fea73919e7c737115009f668f97528;
        oracleAddresses["SOL"] = 0xe86999c8e6C8eeF71bebd35286bCa674E0AD7b21;
        oracleAddresses["QIE"] = 0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17;
    }
    
    /**
     * @dev Get latest price from QIE Oracle
     * @param assetSymbol Asset symbol (BTC, ETH, XRP, SOL, QIE)
     * @return price Latest price from oracle
     */
    function getLatestPrice(string memory assetSymbol) public view returns (int256) {
        address oracleAddr = oracleAddresses[assetSymbol];
        require(oracleAddr != address(0), "Oracle not found for asset");
        
        AggregatorV3Interface priceFeed = AggregatorV3Interface(oracleAddr);
        
        (
            ,
            int256 price,
            ,
            ,
        ) = priceFeed.latestRoundData();
        
        return price;
    }
    
    /**
     * @dev Mint a new prediction NFT
     * @param asset Asset symbol
     * @param predictionType "UP" or "DOWN"
     * @param durationMinutes Duration in minutes (10, 30, or 60)
     */
    function mintPrediction(
        string memory asset,
        string memory predictionType,
        uint256 durationMinutes
    ) external {
        require(
            keccak256(bytes(predictionType)) == keccak256(bytes("UP")) ||
            keccak256(bytes(predictionType)) == keccak256(bytes("DOWN")),
            "Invalid prediction type"
        );
        
        int256 currentPrice = getLatestPrice(asset);
        require(currentPrice > 0, "Invalid price from oracle");
        
        uint256 tokenId = tokenCounter++;
        uint256 resolveTime = block.timestamp + (durationMinutes * 60);
        
        predictions[tokenId] = Prediction({
            asset: asset,
            entryPrice: uint256(currentPrice),
            resolveTime: resolveTime,
            predictionType: predictionType,
            resolved: false,
            resultPrice: 0,
            outcome: ""
        });
        
        emit PredictionMinted(tokenId, asset, uint256(currentPrice), resolveTime);
    }
    
    /**
     * @dev Resolve a prediction by checking oracle price
     * @param tokenId Token ID of the prediction
     */
    function resolvePrediction(uint256 tokenId) external {
        Prediction storage pred = predictions[tokenId];
        require(!pred.resolved, "Already resolved");
        require(block.timestamp >= pred.resolveTime, "Not ready to resolve");
        
        int256 resultPrice = getLatestPrice(pred.asset);
        require(resultPrice > 0, "Invalid price from oracle");
        
        pred.resultPrice = uint256(resultPrice);
        pred.resolved = true;
        
        // Determine outcome
        bool isUp = keccak256(bytes(pred.predictionType)) == keccak256(bytes("UP"));
        bool priceWentUp = int256(pred.resultPrice) > int256(pred.entryPrice);
        
        pred.outcome = (isUp == priceWentUp) ? "WIN" : "LOSE";
        
        emit PredictionResolved(tokenId, pred.outcome, pred.resultPrice);
    }
    
    /**
     * @dev Get prediction details
     * @param tokenId Token ID
     * @return Prediction struct
     */
    function getPrediction(uint256 tokenId) external view returns (Prediction memory) {
        return predictions[tokenId];
    }
}






