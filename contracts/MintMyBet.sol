// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "./interfaces/AggregatorV3Interface.sol";

/**
 * @title MintMyBet
 * @dev NFT-based prediction game with points system and leaderboard
 * Uses QIE Oracle for price feeds (Chainlink-compatible)
 */
contract MintMyBet is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    // Oracle addresses for QIE network
    mapping(string => address) public oracleAddresses;
    string[] public supportedAssets = ["BTC", "ETH", "XRP", "SOL", "QIE"];
    
    // Round configuration
    uint256 public constant ROUND_DURATION = 3600; // 1 hour in seconds
    string[] public round1Assets = ["ETH", "QIE", "BTC"];
    string[] public round2Assets = ["XRP", "SOL"];
    
    // Minting fees
    uint256 public constant MINT_FEE = 0.1 ether; // 0.1 QIE for final mint
    
    // Points system
    mapping(address => uint256) public userPoints;
    mapping(address => uint256) public totalWins;
    mapping(address => uint256) public totalLosses;
    mapping(address => uint256) public currentStreak;
    mapping(address => uint256) public lastClaimTime;
    mapping(address => uint256) public lastDailyClaimDate; // UTC date (days since epoch)
    
    // Weekly reset
    uint256 public lastResetTime;
    uint256 public constant WEEK_DURATION = 7 days;
    
    // Prediction structure
    struct Prediction {
        string asset;
        uint256 entryPrice;
        uint256 resultPrice;
        uint256 resolveTime;
        string predictionType; // "UP" or "DOWN"
        string outcome; // "WIN", "LOSE", or "PENDING"
        string rarity; // "Common", "Rare", "Epic"
        bool resolved;
        bool mintedToWallet;
    }
    
    mapping(uint256 => Prediction) public predictions;
    
    // Leaderboard (top 50)
    struct LeaderboardEntry {
        address user;
        uint256 points;
        uint256 winRate; // Percentage (0-10000, where 10000 = 100%)
    }
    
    LeaderboardEntry[] public leaderboard;
    uint256 public constant LEADERBOARD_SIZE = 50;
    
    // Events
    event PredictionMinted(uint256 indexed tokenId, address indexed user, string asset, uint256 entryPrice, uint256 resolveTime, string rarity);
    event PredictionResolved(uint256 indexed tokenId, string outcome, uint256 resultPrice);
    event NFTMintedToWallet(uint256 indexed tokenId, address indexed user);
    event PointsAwarded(address indexed user, uint256 points, string reason);
    event DailyClaimed(address indexed user, uint256 timestamp);
    event LeaderboardUpdated();
    event LeaderboardReset(uint256 timestamp);
    
    constructor() ERC721("MintMyBet Prediction NFT", "MMB") Ownable() {
        // Initialize QIE Oracle addresses
        oracleAddresses["BTC"] = 0x9E596d809a20A272c788726f592c0d1629755440;
        oracleAddresses["ETH"] = 0x4bb7012Fbc79fE4Ae9B664228977b442b385500d;
        oracleAddresses["XRP"] = 0x804582B1f8Fea73919e7c737115009f668f97528;
        oracleAddresses["SOL"] = 0xe86999c8e6C8eeF71bebd35286bCa674E0AD7b21;
        oracleAddresses["QIE"] = 0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17;
        
        lastResetTime = block.timestamp;
    }
    
    /**
     * @dev Get latest price from QIE Oracle
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
     * @dev Get current round (1 or 2) based on hour
     */
    function getCurrentRound() public view returns (uint256) {
        uint256 hour = (block.timestamp / ROUND_DURATION) % 24;
        return (hour % 2 == 0) ? 1 : 2;
    }
    
    /**
     * @dev Get active assets for current round
     */
    function getActiveAssets() public view returns (string[] memory) {
        uint256 round = getCurrentRound();
        return (round == 1) ? round1Assets : round2Assets;
    }
    
    /**
     * @dev Check if asset is active in current round
     */
    function isAssetActive(string memory asset) public view returns (bool) {
        string[] memory active = getActiveAssets();
        for (uint256 i = 0; i < active.length; i++) {
            if (keccak256(bytes(active[i])) == keccak256(bytes(asset))) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * @dev Get rarity based on duration
     */
    function getRarity(uint256 durationMinutes) public pure returns (string memory) {
        if (durationMinutes == 10) return "Common";
        if (durationMinutes == 30) return "Rare";
        if (durationMinutes == 60) return "Epic";
        revert("Invalid duration");
    }
    
    /**
     * @dev Get points multiplier for rarity
     */
    function getRarityMultiplier(string memory rarity) public pure returns (uint256) {
        if (keccak256(bytes(rarity)) == keccak256(bytes("Common"))) return 1;
        if (keccak256(bytes(rarity)) == keccak256(bytes("Rare"))) return 2;
        if (keccak256(bytes(rarity)) == keccak256(bytes("Epic"))) return 3;
        return 0;
    }
    
    /**
     * @dev Mint a new prediction NFT (FREE, user pays gas only)
     */
    function mintPrediction(
        string memory asset,
        string memory predictionType,
        uint256 durationMinutes
    ) external {
        require(isAssetActive(asset), "Asset not active in current round");
        require(
            keccak256(bytes(predictionType)) == keccak256(bytes("UP")) ||
            keccak256(bytes(predictionType)) == keccak256(bytes("DOWN")),
            "Invalid prediction type"
        );
        require(durationMinutes == 10 || durationMinutes == 30 || durationMinutes == 60, "Invalid duration");
        
        int256 currentPrice = getLatestPrice(asset);
        require(currentPrice > 0, "Invalid price from oracle");
        
        uint256 tokenId = _tokenIds.current();
        _tokenIds.increment();
        
        uint256 resolveTime = block.timestamp + (durationMinutes * 60);
        string memory rarity = getRarity(durationMinutes);
        
        predictions[tokenId] = Prediction({
            asset: asset,
            entryPrice: uint256(currentPrice),
            resultPrice: 0,
            resolveTime: resolveTime,
            predictionType: predictionType,
            outcome: "PENDING",
            rarity: rarity,
            resolved: false,
            mintedToWallet: false
        });
        
        _safeMint(msg.sender, tokenId);
        
        emit PredictionMinted(tokenId, msg.sender, asset, uint256(currentPrice), resolveTime, rarity);
    }
    
    /**
     * @dev Resolve a prediction by checking oracle price
     */
    function resolvePrediction(uint256 tokenId) external {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
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
        bool priceWentDown = int256(pred.resultPrice) < int256(pred.entryPrice);
        bool priceStayedSame = pred.resultPrice == pred.entryPrice;
        
        // If price stayed the same (0% change), it's always a LOSE
        if (priceStayedSame) {
            pred.outcome = "LOSE";
        } else {
            pred.outcome = (isUp == priceWentUp) ? "WIN" : "LOSE";
        }
        
        // Award or deduct points
        // Points stored as integers (multiplied by 10 for precision: 10 = 1.0 point)
        address user = _ownerOf(tokenId);
        if (keccak256(bytes(pred.outcome)) == keccak256(bytes("WIN"))) {
            uint256 points = getRarityMultiplier(pred.rarity) * 10; // 1, 2, or 3 points = 10, 20, or 30
            userPoints[user] += points;
            totalWins[user]++;
            currentStreak[user]++;
            emit PointsAwarded(user, points, "Win");
        } else {
            uint256 lossPenalty = 5; // 0.5 points = 5 (since multiplied by 10)
            userPoints[user] = userPoints[user] > lossPenalty ? userPoints[user] - lossPenalty : 0;
            totalLosses[user]++;
            currentStreak[user] = 0;
            emit PointsAwarded(user, 0, "Loss");
        }
        
        // Update leaderboard
        _updateLeaderboard(user);
        
        emit PredictionResolved(tokenId, pred.outcome, pred.resultPrice);
    }
    
    /**
     * @dev Mint resolved NFT to wallet (costs 0.1 QIE)
     */
    function mintResolvedNFT(uint256 tokenId) external payable {
        require(_ownerOf(tokenId) == msg.sender, "Not owner");
        require(msg.value >= MINT_FEE, "Insufficient payment");
        Prediction storage pred = predictions[tokenId];
        require(pred.resolved, "Not resolved yet");
        require(!pred.mintedToWallet, "Already minted to wallet");
        
        pred.mintedToWallet = true;
        
        emit NFTMintedToWallet(tokenId, msg.sender);
    }
    
    /**
     * @dev Claim daily bonus (+1 point, resets at midnight UTC)
     */
    function claimDailyBonus() external {
        uint256 currentDate = block.timestamp / 1 days;
        require(lastDailyClaimDate[msg.sender] < currentDate, "Already claimed today");
        
        lastDailyClaimDate[msg.sender] = currentDate;
        lastClaimTime[msg.sender] = block.timestamp;
        userPoints[msg.sender] += 10; // 1 point = 10 (multiplied by 10)
        
        _updateLeaderboard(msg.sender);
        
        emit DailyClaimed(msg.sender, block.timestamp);
        emit PointsAwarded(msg.sender, 1, "Daily Claim");
    }
    
    /**
     * @dev Get time until next daily claim (in seconds)
     */
    function getTimeUntilNextClaim(address user) public view returns (uint256) {
        uint256 currentDate = block.timestamp / 1 days;
        if (lastDailyClaimDate[user] < currentDate) {
            return 0; // Can claim now
        }
        uint256 nextMidnight = (currentDate + 1) * 1 days;
        return nextMidnight - block.timestamp;
    }
    
    /**
     * @dev Get user statistics
     */
    function getUserStats(address user) public view returns (
        uint256 points,
        uint256 wins,
        uint256 losses,
        uint256 streak,
        uint256 winRate,
        uint256 nextClaimTime
    ) {
        points = userPoints[user];
        wins = totalWins[user];
        losses = totalLosses[user];
        streak = currentStreak[user];
        
        uint256 total = wins + losses;
        winRate = total > 0 ? (wins * 10000) / total : 0; // Percentage in basis points
        
        nextClaimTime = getTimeUntilNextClaim(user);
    }
    
    /**
     * @dev Update leaderboard with user
     */
    function _updateLeaderboard(address user) internal {
        (uint256 points, , , , uint256 winRate, ) = getUserStats(user);
        
        // Find if user already in leaderboard
        bool found = false;
        uint256 insertIndex = leaderboard.length;
        
        for (uint256 i = 0; i < leaderboard.length; i++) {
            if (leaderboard[i].user == user) {
                found = true;
                leaderboard[i].points = points;
                leaderboard[i].winRate = winRate;
                break;
            }
            // Find insertion point (sorted by points desc, then win rate desc)
            if (!found && (points > leaderboard[i].points || 
                (points == leaderboard[i].points && winRate > leaderboard[i].winRate))) {
                insertIndex = i;
                break;
            }
        }
        
        if (!found) {
            if (leaderboard.length < LEADERBOARD_SIZE) {
                leaderboard.push(LeaderboardEntry(user, points, winRate));
            } else if (insertIndex < LEADERBOARD_SIZE) {
                // Remove last entry and insert
                leaderboard[LEADERBOARD_SIZE - 1] = LeaderboardEntry(user, points, winRate);
            }
        }
        
        // Sort leaderboard
        _sortLeaderboard();
        
        emit LeaderboardUpdated();
    }
    
    /**
     * @dev Sort leaderboard by points (desc), then win rate (desc)
     */
    function _sortLeaderboard() internal {
        // Simple bubble sort for small array (50 items max)
        for (uint256 i = 0; i < leaderboard.length; i++) {
            for (uint256 j = 0; j < leaderboard.length - i - 1; j++) {
                if (leaderboard[j].points < leaderboard[j + 1].points ||
                    (leaderboard[j].points == leaderboard[j + 1].points && 
                     leaderboard[j].winRate < leaderboard[j + 1].winRate)) {
                    LeaderboardEntry memory temp = leaderboard[j];
                    leaderboard[j] = leaderboard[j + 1];
                    leaderboard[j + 1] = temp;
                }
            }
        }
    }
    
    /**
     * @dev Get top 50 leaderboard
     */
    function getLeaderboard() public view returns (LeaderboardEntry[] memory) {
        uint256 length = leaderboard.length < LEADERBOARD_SIZE ? leaderboard.length : LEADERBOARD_SIZE;
        LeaderboardEntry[] memory result = new LeaderboardEntry[](length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = leaderboard[i];
        }
        return result;
    }
    
    /**
     * @dev Reset leaderboard (weekly, can be called by anyone after week passes)
     */
    function resetLeaderboard() external {
        require(block.timestamp >= lastResetTime + WEEK_DURATION, "Weekly reset not ready");
        
        // Clear leaderboard
        delete leaderboard;
        
        // Reset all user stats
        // Note: This is gas-intensive, consider batching or off-chain reset
        // For now, we'll just clear the leaderboard array
        // Individual user stats remain for historical tracking
        
        lastResetTime = block.timestamp;
        
        emit LeaderboardReset(block.timestamp);
    }
    
    /**
     * @dev Get prediction details
     */
    function getPrediction(uint256 tokenId) external view returns (Prediction memory) {
        return predictions[tokenId];
    }
    
    /**
     * @dev Get time until next round (in seconds)
     */
    function getTimeUntilNextRound() public view returns (uint256) {
        uint256 currentHour = (block.timestamp / ROUND_DURATION) % 24;
        uint256 nextHour = ((currentHour / 2) + 1) * 2; // Next even hour for round 1
        if (nextHour >= 24) nextHour = 0;
        uint256 nextRoundTime = ((block.timestamp / (ROUND_DURATION * 24)) * (ROUND_DURATION * 24)) + (nextHour * ROUND_DURATION);
        if (nextRoundTime <= block.timestamp) {
            nextRoundTime += (24 * ROUND_DURATION);
        }
        return nextRoundTime - block.timestamp;
    }
    
    /**
     * @dev Withdraw contract balance (owner only)
     */
    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
    
    /**
     * @dev Override tokenURI to return dynamic metadata
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        Prediction memory pred = predictions[tokenId];
        
        // Build comprehensive JSON metadata
        string memory name = string(abi.encodePacked("Prediction #", _toString(tokenId)));
        string memory description = string(abi.encodePacked(
            "MintMyBet Prediction NFT - ", pred.asset, " ", pred.predictionType, " prediction"
        ));
        
        // Build attributes array
        string memory attributes = string(abi.encodePacked(
            '{"trait_type":"Asset","value":"', pred.asset, '"},',
            '{"trait_type":"Rarity","value":"', pred.rarity, '"},',
            '{"trait_type":"Outcome","value":"', pred.outcome, '"},',
            '{"trait_type":"Prediction Type","value":"', pred.predictionType, '"},',
            '{"trait_type":"Entry Price","value":"', _toString(pred.entryPrice), '"}'
        ));
        
        // Add result price if resolved
        if (pred.resolved && pred.resultPrice > 0) {
            attributes = string(abi.encodePacked(
                attributes,
                ',{"trait_type":"Result Price","value":"', _toString(pred.resultPrice), '"}'
            ));
            
            // Calculate price change percentage (simplified - show as string)
            if (pred.entryPrice > 0) {
                uint256 change;
                bool isPositive;
                if (pred.resultPrice >= pred.entryPrice) {
                    change = pred.resultPrice - pred.entryPrice;
                    isPositive = true;
                } else {
                    change = pred.entryPrice - pred.resultPrice;
                    isPositive = false;
                }
                // Calculate percentage (multiply by 10000 for 2 decimal places)
                uint256 changePercent = (change * 10000) / pred.entryPrice;
                uint256 wholePart = changePercent / 100;
                uint256 decimalPart = changePercent % 100;
                
                string memory sign = isPositive ? "+" : "-";
                string memory changeStr = string(abi.encodePacked(
                    sign,
                    _toString(wholePart),
                    ".",
                    decimalPart < 10 ? string(abi.encodePacked("0", _toString(decimalPart))) : _toString(decimalPart),
                    "%"
                ));
                attributes = string(abi.encodePacked(
                    attributes,
                    ',{"trait_type":"Price Change","value":"', changeStr, '"}'
                ));
            }
        }
        
        // Build complete JSON
        string memory json = string(abi.encodePacked(
            '{"name":"', name, '",',
            '"description":"', description, '",',
            '"image":"data:image/svg+xml;base64,', _generateSVGImage(pred), '",',
            '"attributes":[', attributes, ']}'
        ));
        
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }
    
    /**
     * @dev Generate a simple SVG image for the NFT
     */
    function _generateSVGImage(Prediction memory pred) internal pure returns (string memory) {
        string memory bgColor = keccak256(bytes(pred.outcome)) == keccak256(bytes("WIN")) 
            ? "#22c55e" 
            : "#ef4444";
        string memory textColor = "#ffffff";
        
        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<rect width="400" height="400" fill="', bgColor, '"/>',
            '<text x="200" y="150" font-family="Arial" font-size="32" fill="', textColor, '" text-anchor="middle" font-weight="bold">', pred.asset, '</text>',
            '<text x="200" y="200" font-family="Arial" font-size="24" fill="', textColor, '" text-anchor="middle">', pred.outcome, '</text>',
            '<text x="200" y="250" font-family="Arial" font-size="18" fill="', textColor, '" text-anchor="middle">', pred.rarity, '</text>',
            '</svg>'
        ));
        
        return Base64.encode(bytes(svg));
    }
    
    // Helper functions for string conversion
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
    
}

