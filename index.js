require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const validator = require("validator");
const morgan = require("morgan");
const { v4: uuidv4 } = require("uuid");
const qs = require("querystring");

const {
  encrypt,
  decrypt
} = require("./utils/ccavutil");

const app = express();

app.use(helmet());
app.disable("x-powered-by");

// app.use(cors());

app.use(cors({
  origin: "*"
}));

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
  name: {
    type: String,
    required: true,
    trim: true
  },

  phone: {
    type: String,
    required: true,
    trim: true
  },

  amount: {
    type: Number,
    required: true
  },

  employeeCode: {
    type: String,
    default: "GENERAL"
  },

  paymentStatus: {
    type: String,
    enum: ["pending", "success", "failed"],
    default: "pending"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Donation = mongoose.model("Donation", donationSchema);

app.post("/api/donate", async (req, res) => {
  try {

    const {
      name,
      phone,
      amount,
      employeeCode
    } = req.body;

    if (!name || !phone || !amount) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    if (!validator.isMobilePhone(phone + "", "en-IN")) {
      return res.status(400).json({
        message: "Invalid phone number"
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        message: "Invalid amount"
      });
    }

    const newDonation = new Donation({
      name,
      phone,
      amount,
      employeeCode: employeeCode || "GENERAL",
      paymentStatus: "pending"
    });

    await newDonation.save();

    res.status(201).json({
      message: "Donation saved successfully"
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message: "Server error"
    });
  }
});

app.post("/api/payment", async (req, res) => {

  try {

    const {
      name,
      phone,
      amount,
      employeeCode
    } = req.body;

    if (!name || !phone || !amount) {
      return res.status(400).json({
        message: "All fields required"
      });
    }

    const orderId = uuidv4();

    const donation = new Donation({
      name,
      phone,
      amount,
      employeeCode: employeeCode || "GENERAL",
      paymentStatus: "pending"
    });

    await donation.save();

    const paymentData = {

      merchant_id: process.env.CCA_MERCHANT_ID,

      order_id: orderId,

      currency: "INR",

      amount: amount,

      redirect_url:
        `${process.env.CLIENT_URL}/payment-success`,

      cancel_url:
        `${process.env.CLIENT_URL}/payment-failed`,

      language: "EN",

      billing_name: name,

      billing_tel: phone
    };

    const paymentString =
      qs.stringify(paymentData);

    const encryptedData = encrypt(
      paymentString,
      process.env.CCA_WORKING_KEY
    );

    res.json({

      encryptedData,

      accessCode: process.env.CCA_ACCESS_CODE
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message: "Payment initiation failed"
    });
  }
});

app.get("/", (req, res) => {
  res.send("Server is running...");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});