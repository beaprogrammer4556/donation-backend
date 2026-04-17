require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const validator = require("validator");
const morgan = require("morgan");

const app = express();

app.use(helmet());
app.disable("x-powered-by");

app.use(cors());

app.use(express.json({ limit: "10kb" }));

app.use(morgan("combined"));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50
});
app.use(limiter);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => {
    console.log("MongoDB Error:", err);
    process.exit(1);
  });

const donationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  amount: { type: Number, required: true },
  status: {
    type: String,
    default: "pending"
  },
  date: {
    type: Date,
    default: Date.now
  }
});

const Donation = mongoose.model("Donation", donationSchema);

app.post("/api/donate", async (req, res) => {
  try {
    const { name, phone, amount } = req.body;

    if (!name || !phone || !amount) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!validator.isMobilePhone(phone + "")) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    if (amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const existing = await Donation.findOne({ phone, amount });

    if (existing) {
      return res.status(400).json({ message: "Duplicate entry detected" });
    }

    const newDonation = new Donation({ name, phone, amount });
    await newDonation.save();

    res.status(201).json({ message: "Data saved successfully" });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error saving data" });
  }
});

app.get("/", (req, res) => {
  res.send("Server is running...");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});