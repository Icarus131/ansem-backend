require("dotenv").config();
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 5000;

const JWT_SECRET = process.env.JWT_SECRET || "secret_key";

const db = new sqlite3.Database("./main.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS wallet_data (
        wallet_address TEXT PRIMARY KEY,
        tokens INTEGER,
        punches INTEGER,
        referredBy TEXT,
        characterName TEXT,
        win INTEGER DEFAULT 0
    )`);
});

app.use(bodyParser.json());

app.post("/api/wallet", (req, res) => {
  const token = req.body.token;

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { wallet_address, data } = decoded;
    const {
      tokens = 0,
      punches = 0,
      referredBy = "",
      characterName = "",
    } = data || {};

    db.get(
      "SELECT * FROM wallet_data WHERE wallet_address = ?",
      [wallet_address],
      (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }

        if (row) {
          db.run(
            `UPDATE wallet_data SET tokens = ?, punches = ?, referredBy = ?, characterName = ? WHERE wallet_address = ?`,
            [tokens, punches, referredBy, characterName, wallet_address],
            (err) => {
              if (err) {
                res.status(500).json({ error: err.message });
                return;
              }
              res.json({ message: "Wallet data updated successfully" });

              if (referredBy) {
                fundReferrer(referredBy);
              }
            },
          );
        } else {
          db.run(
            `INSERT INTO wallet_data (wallet_address, tokens, punches, referredBy, characterName) VALUES (?, ?, ?, ?, ?)`,
            [wallet_address, tokens, punches, referredBy, characterName],
            (err) => {
              if (err) {
                res.status(500).json({ error: err.message });
                return;
              }
              res.json({ message: "Wallet data inserted successfully" });
            },
          );
        }
      },
    );
  });
});

app.post("/api/finish", (req, res) => {
  const { wallet_address, win } = req.body;

  if (!wallet_address || typeof win !== "number") {
    return res.status(400).json({ error: "Invalid request data" });
  }

  db.get(
    "SELECT * FROM wallet_data WHERE wallet_address = ?",
    [wallet_address],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      if (row) {
        db.run(
          `UPDATE wallet_data SET win = win + ? WHERE wallet_address = ?`,
          [win, wallet_address],
          (err) => {
            if (err) {
              res.status(500).json({ error: err.message });
              return;
            }
            res.json({ message: "Win count updated successfully" });
          },
        );
      } else {
        db.run(
          `INSERT INTO wallet_data (wallet_address, tokens, punches, referredBy, characterName, win) VALUES (?, ?, ?, ?, ?, ?)`,
          [wallet_address, 0, 0, "", "", win],
          (err) => {
            if (err) {
              res.status(500).json({ error: err.message });
              return;
            }
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
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    },
  );
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

async function fundReferrer(referredBy) {
  try {
    db.get(
      "SELECT * FROM wallet_data WHERE wallet_address = ?",
      [referredBy],
      (err, row) => {
        if (err) {
          console.error("Error checking referredBy:", err);
          return;
        }
        let referralPunches = 0;
        if (row) {
          referralPunches = Math.floor(row.punches * 0.1);
        }

        db.run(
          `UPDATE wallet_data SET punches = punches + ? WHERE wallet_address = ?`,
          [referralPunches, referredBy],
          (err) => {
            if (err) {
              console.error("Error updating punches:", err);
              return;
            }
            console.log(
              `Updated punches for ref ${referredBy}: ${referralPunches}`,
            );
          },
        );
        if (!row) {
          db.run(
            `INSERT INTO wallet_data (wallet_address, tokens, punches, referredBy, characterName) VALUES (?, ?, ?, ?, ?)`,
            [referredBy, 0, referralPunches, referredBy, ""],
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
