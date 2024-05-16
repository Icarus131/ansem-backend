//using this to test the api
const jwt = require("jsonwebtoken");
const payload = {
  wallet_address: "dummy_wallet_address",
  tokens: 100,
  punches: 50,
  referredBy: "dummy_referrer_address",
  characterName: "dummy_character_name",
};

const secretKey = "scrt_key";
const token = jwt.sign(payload, secretKey);

console.log("Encoded JWT token:", token);
