require("dotenv").config();
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

const JWT_SECRET = process.env.JWT_SECRET || "secret_key";

const db = new sqlite3.Database("./main.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS wallet_data (
        wallet_address TEXT PRIMARY KEY,
        tokens INTEGER DEFAULT 0,
        punches INTEGER DEFAULT 0,
        bonusPunches INTEGER DEFAULT 0,
        referredBy TEXT,
        characterName TEXT,
        win INTEGER DEFAULT 0
    )`);
});

app.use(cors());
app.use(bodyParser.json());

app.post("/api/wallet", (req, res) => {
  const token = req.body.token;
  console.log("Received token:", token);

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("JWT verification error:", err);
      return res.status(401).json({ error: "Invalid token" });
    }

    console.log("Decoded token:", decoded);

    const {
      wallet_address,
      tokens = 0,
      punches = 0,
      referredBy = "",
      characterName = "",
    } = decoded;

    console.log("Wallet address:", wallet_address);
    console.log("Data:", { tokens, punches, referredBy, characterName });

    db.get(
      "SELECT * FROM wallet_data WHERE wallet_address = ?",
      [wallet_address],
      (err, row) => {
        if (err) {
          console.error("DB get error:", err);
          res.status(500).json({ error: err.message });
          return;
        }

        if (row) {
          console.log("Updating wallet data for:", wallet_address);
          const newTokens = parseInt(row.tokens) + parseInt(tokens);
          const newPunches = parseInt(row.punches) + parseInt(punches);

          db.run(
            `UPDATE wallet_data SET tokens = ?, punches = ?, referredBy = ?, characterName = ? WHERE wallet_address = ?`,
            [newTokens, newPunches, referredBy, characterName, wallet_address],
            (err) => {
              if (err) {
                console.error("DB update error:", err);
                res.status(500).json({ error: err.message });
                return;
              }
              console.log("Wallet data updated successfully");
              res.json({ message: "Wallet data updated successfully" });

              if (referredBy) {
                fundReferrer(referredBy, punches, wallet_address);
              }
            },
          );
        } else {
          console.log("Inserting new wallet data for:", wallet_address);
          db.run(
            `INSERT INTO wallet_data (wallet_address, tokens, punches, referredBy, characterName) VALUES (?, ?, ?, ?, ?)`,
            [wallet_address, tokens, punches, referredBy, characterName],
            (err) => {
              if (err) {
                console.error("DB insert error:", err);
                res.status(500).json({ error: err.message });
                return;
              }
              console.log("Wallet data inserted successfully");
              res.json({ message: "Wallet data inserted successfully" });

              if (referredBy) {
                fundReferrer(referredBy, punches, wallet_address);
              }
            },
          );
        }
      },
    );
  });
});

app.post("/api/finish", (req, res) => {
  const { wallet_address, win } = req.body;

  console.log("Finish endpoint called with:", { wallet_address, win });

  if (!wallet_address || typeof win !== "number") {
    console.error("Invalid request data:", req.body);
    return res.status(400).json({ error: "Invalid request data" });
  }

  db.get(
    "SELECT * FROM wallet_data WHERE wallet_address = ?",
    [wallet_address],
    (err, row) => {
      if (err) {
        console.error("DB get error:", err);
        res.status(500).json({ error: err.message });
        return;
      }

      if (row) {
        console.log("Updating win count for:", wallet_address);
        db.run(
          `UPDATE wallet_data SET win = win + ? WHERE wallet_address = ?`,
          [win, wallet_address],
          (err) => {
            if (err) {
              console.error("DB update error:", err);
              res.status(500).json({ error: err.message });
              return;
            }
            console.log("Win count updated successfully");
            res.json({ message: "Win count updated successfully" });
          },
        );
      } else {
        console.log(
          "Inserting new wallet data with win count for:",
          wallet_address,
        );
        db.run(
          `INSERT INTO wallet_data (wallet_address, tokens, punches, referredBy, characterName, win) VALUES (?, ?, ?, ?, ?, ?)`,
          [wallet_address, 0, 0, "", "", win],
          (err) => {
            if (err) {
              console.error("DB insert error:", err);
              res.status(500).json({ error: err.message });
              return;
            }
            console.log(
              "Wallet data inserted and win count updated successfully",
            );
            res.json({
              message:
                "Wallet data inserted and win count updated successfully",
            });
          },
        );
      }
    },
  );
});

app.get("/api/leaderboard", (req, res) => {
  db.all(
    "SELECT * FROM wallet_data ORDER BY win DESC LIMIT 10",
    (err, rows) => {
      if (err) {
        console.error("DB get all error:", err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log("Leaderboard data:", rows);
      res.json(rows);
    },
  );
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.post("/api/details", (req, res) => {
  const { wallet_address } = req.body;

  if (!wallet_address) {
    return res.status(400).json({ error: "Wallet address is required" });
  }

  db.get(
    "SELECT * FROM wallet_data WHERE wallet_address = ?",
    [wallet_address],
    (err, row) => {
      if (err) {
        console.error("DB get error:", err);
        res.status(500).json({ error: err.message });
        return;
      }

      if (row) {
        console.log("Details found for wallet address:", wallet_address);
        res.json(row);
      } else {
        console.log("No details found for wallet address:", wallet_address);
        res
          .status(404)
          .json({ error: "No details found for this wallet address" });
      }
    },
  );
});

async function fundReferrer(referredBy, punches, walletAddress) {
  try {
    if (referredBy === walletAddress) {
      console.log("Self-referral detected. Self-referrals are not allowed.");
      return;
    }

    const referralPunches = Math.floor(parseInt(punches) * 0.1);

    db.get(
      "SELECT * FROM wallet_data WHERE wallet_address = ?",
      [referredBy],
      (err, row) => {
        if (err) {
          console.error("Error checking referredBy:", err);
          return;
        }

        if (row) {
          const newBonusPunches = parseInt(row.bonusPunches) + referralPunches;
          console.log(
            `Updating bonus punches for referrer ${referredBy} by ${referralPunches}`,
          );

          db.run(
            `UPDATE wallet_data SET bonusPunches = ? WHERE wallet_address = ?`,
            [newBonusPunches, referredBy],
            (err) => {
              if (err) {
                console.error("Error updating bonus punches:", err);
                return;
              }
              console.log(
                `Updated bonus punches for referrer ${referredBy}: ${newBonusPunches}`,
              );
            },
          );
        } else {
          console.log(
            `Adding new referrer ${referredBy} with bonus punches ${referralPunches}`,
          );
          db.run(
            `INSERT INTO wallet_data (wallet_address, tokens, punches, bonusPunches, referredBy, characterName) VALUES (?, ?, ?, ?, ?, ?)`,
            [referredBy, 0, 0, referralPunches, "", ""],
            (err) => {
              if (err) {
                console.error("Error adding referredBy:", err);
                return;
              }
              console.log(`Added referredBy ${referredBy} to the database`);
            },
          );
        }
      },
    );
  } catch (error) {
    console.error("Error funding referrer:", error);
  }
}
