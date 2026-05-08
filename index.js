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

const { encrypt } = require("./utils/ccavutil");

const app = express();

app.use(helmet());
app.disable("x-powered-by");

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10kb" }));
app.use(morgan("combined"));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
});

app.use(limiter);

// DATABASE
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => {
    console.log("MongoDB Error:", err);
    process.exit(1);
  });

// SCHEMA
const donationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },

  phone: {
    type: String,
    required: true,
    trim: true,
  },

  amount: {
    type: Number,
    required: true,
  },

  employeeCode: {
    type: String,
    default: "GENERAL",
  },

  paymentStatus: {
    type: String,
    enum: ["pending", "success", "failed"],
    default: "pending",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Donation = mongoose.model("Donation", donationSchema);

// SAVE DONATION ONLY
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
        message: "All fields are required",
      });
    }

    if (!validator.isMobilePhone(phone + "", "en-IN")) {
      return res.status(400).json({
        message: "Invalid phone number",
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        message: "Invalid amount",
      });
    }

    const donation = new Donation({
      name,
      phone,
      amount,
      employeeCode: employeeCode || "GENERAL",
      paymentStatus: "pending",
    });

    await donation.save();

    res.status(201).json({
      message: "Donation saved successfully",
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message: "Server error",
    });
  }
});

// PAYMENT ROUTE
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
        message: "All fields required",
      });
    }

    const orderId = uuidv4();

    // SAVE PENDING DONATION
    await new Donation({
      name,
      phone,
      amount,
      employeeCode: employeeCode || "GENERAL",
      paymentStatus: "pending",
    }).save();

    // SUCCESS / FAILURE URLS
    const redirectUrl =
      `${process.env.CLIENT_URL}/payment-success`;

    const cancelUrl =
      `${process.env.CLIENT_URL}/payment-failed`;

    // OFFICIAL CCAvenue FORMAT
    const paymentData = {

      merchant_id: process.env.CCA_MERCHANT_ID,

      order_id: orderId,

      currency: "INR",

      amount: amount,

      redirect_url: redirectUrl,

      cancel_url: cancelUrl,

      language: "EN",

      billing_name: name,

      billing_tel: phone,

      billing_email: "test@example.com",
    };

    // CONVERT OBJECT TO QUERY STRING
    const paymentString =
      qs.stringify(paymentData);

    console.log("PAYMENT STRING:");
    console.log(paymentString);

    console.log("WORKING KEY:");
    console.log(process.env.CCA_WORKING_KEY);

    // ENCRYPT REQUEST
    const encryptedData = encrypt(
      paymentString,
      process.env.CCA_WORKING_KEY
    );

    console.log("ENCRYPTED DATA:");
    console.log(encryptedData);

    return res.json({
      encryptedData,
      accessCode: process.env.CCA_ACCESS_CODE,
      orderId,
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({
      message: "Payment initiation failed",
    });
  }
});

// ROOT
app.get("/", (req, res) => {
  res.send("Server is running...");
});

// SERVER
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});