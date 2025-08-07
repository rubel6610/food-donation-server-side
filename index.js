const express = require("express");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
var admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173","https://sage-gumption-dbbe8e.netlify.app"],
    credentials: true,
  })
);

const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decodedKey);
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // ...other config
  });
}


// MongoDB URI
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// firebase verification
const verifyFbToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send({ message: "Unauthorized" });

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ message: "Forbidden" });

    req.user = decoded;
    next();
  });
};

// email verification
const verifyEmail = (req, res, next) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }
  if (req.user.email !== email) {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};
const verifyAdmin = async (req, res, next) => {
  const email = req.user?.email;
  const user = await userCollections.findOne({ email });
  if (user?.role !== "admin") {
    return res.status(403).send({ message: "Forbidden: Admins only" });
  }
  next();
};
const verifyRestaurant = async (req, res, next) => {
  const email = req.user?.email;
  const user = await userCollections.findOne({ email });
  if (user?.role !== "restaurant") {
    return res.status(403).send({ message: "Forbidden: restaurant only" });
  }
  next();
};
const verifyCharity = async (req, res, next) => {
  const email = req.user?.email;
  const user = await userCollections.findOne({ email });
  if (user?.role !== "charity") {
    return res.status(403).send({ message: "Forbidden: restaurant only" });
  }
  next();
};

const db = client.db("foodWasteReduction");
const userCollections = db.collection("users");
const paymentsCollections = db.collection("payments");
const donationsCollection = db.collection("donations");
const requestsCollection = db.collection("requests");
const reviewsCollection = db.collection("reviews");
const faovouritesCollection = db.collection("favourites");

app.post("/users", async (req, res) => {
  const userData = req.body;
  await userCollections.insertOne(userData);
  res.status(201).send(userData);
});
app.get("/singleUser",verifyFbToken,verifyEmail, async (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }
  const user = await userCollections.findOne({ email });
  res.send(user);
});
app.get("/users", verifyFbToken, async (req, res) => {
  try {
    const users = await userCollections.find().toArray();
    res.send(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

app.get("/users/role", verifyFbToken, async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }

  const user = await userCollections.findOne({ email: email });
  if (!user) {
    return res.status(404).send({ message: "User not found" });
  }

  res.send({
    role: user.role,
    showApprovalPopup: user.showApprovalPopup || false,
  });
});
// For user to charity by admin update only
app.patch("/users/role", verifyFbToken, async (req, res) => {
  const email = req.query.email;
  const { role, status } = req.body;
  if (!email || !role) {
    return res.status(400).send({ message: "Missing email or role" });
  }
  await paymentsCollections.updateOne(
    { email },
    {
      $set: {
        status: status,
      },
    }
  );
  const result = await userCollections.updateOne(
    { email },
    { $set: { role: role, status: status, showApprovalPopup: true } }
  );
  res.send(result);
});
app.patch("/users/hide-charityPopup", verifyFbToken, async (req, res) => {
  const email = req.query.email;
  const updatedDoc = {
    $set: {
      showApprovalPopup: false,
    },
  };
  await userCollections.updateOne({ email }, updatedDoc);
});

app.patch("/users", verifyFbToken, async (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }
  const updateData = req.body;
  const result = await userCollections.updateOne(
    { email: email },
    { $set: updateData }
  );
  res.send(result);
});
// delete user data by admin
app.delete("/users", verifyFbToken, verifyAdmin, async (req, res) => {
  const { email, userId } = req.query;
  await admin.auth().deleteUser(userId);
  const result = await userCollections.deleteOne({ email });
  const paymentDelete = await paymentsCollections.deleteOne({ email });
  res.send(result);
});

// payment intent creation
app.post("/create-payment-intent", verifyFbToken, async (req, res) => {
  const { amount } = req.body;
  if (!amount) {
    return res.status(400).send({ message: "Amount is required" });
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount * 100,
    currency: "usd",
    payment_method_types: ["card"],
  });

  res.send({ clientSecret: paymentIntent.client_secret });
});

app.post("/payments", verifyFbToken, async (req, res) => {
  const paymentExists = await paymentsCollections.findOne({
    email: req.body.email,
  });
  if (paymentExists) {
    return res
      .status(400)
      .send({ message: "Payment already exists for this user" });
  }

  const charityData = req.body;
  const { mission, organization, payment_amount, paymentId, name, email } =
    charityData;
  await userCollections.updateOne(
    { email: email },
    {
      $set: {
        paymentStatus: "paid",
        paymentAmount: payment_amount,
        paymentDate: new Date().toISOString(),
        mission: mission,
        organization: organization,
        status: "pending",
      },
    }
  );

  const insertResult = await paymentsCollections.insertOne({
    name,
    email,
    organization,
    payment_amount: payment_amount / 100,
    paymentId,
    paidAt: new Date().toISOString(),
    status: "pending",
  });

  res.send(insertResult);
});

app.get("/payments", verifyFbToken, verifyEmail, async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }

  const payments = await paymentsCollections.find({ email: email }).toArray();
  res.send(payments);
});
// donations apis
app.post("/donations", verifyFbToken,verifyRestaurant, async (req, res) => {
  const donation = req.body;
  const result = await donationsCollection.insertOne(donation);
  res.send(result);
});
app.get("/donations", verifyFbToken, verifyAdmin, async (req, res) => {
  const result = await donationsCollection
    .find()
    .sort({ donated_At: -1 })
    .toArray();
  res.send(result);
});
app.get("/donations/verified", async (req, res) => {
  const filter = { status: "verified" };
  const result = await donationsCollection.find(filter).toArray();
  res.send(result);
});
app.get("/donation/:id", verifyFbToken, async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const result = await donationsCollection.findOne(filter);
  res.send(result);
});
app.get(
  "/donations/restaurant",
  verifyFbToken,
  verifyEmail,
verifyRestaurant,
  async (req, res) => {
    const email = req.query.email;
    const result = await donationsCollection
      .find({ restaurantEmail: email })
      .sort({ donated_At: -1 })
      .toArray();
    res.send(result);
  }
);

// donation verify
app.patch(
  "/donations/verify/:id",
  verifyFbToken,
  verifyAdmin,
  async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const { status, donationStatus } = req.body;
    const updateDoc = {
      $set: {
        status,
        donationStatus,
      },
    };
    const result = await donationsCollection.updateOne(filter, updateDoc);
    res.send(result);
  }
);
//donation rejection
app.patch(
  "/donations/reject/:id",
  verifyFbToken,
  verifyAdmin,
  async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const { status } = req.body;
    const updateDoc = {
      $set: {
        status,
      },
    };
    const result = await donationsCollection.updateOne(filter, updateDoc);
    res.send(result);
  }
);
app.patch("/donations/:id", verifyFbToken,verifyRestaurant, async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const { title, foodType, imageUrl, location, pickupTime, quantity } =
    req.body;
  const updatedDoc = {
    $set: {
      title,
      foodType,
      imageUrl,
      location,
      pickupTime,
      quantity,
      status: "pending",
    },
  };
  const result = await donationsCollection.updateOne(query, updatedDoc);
  res.send(result);
});

app.delete("/donations/:id", verifyFbToken,verifyRestaurant, async (req, res) => {
  const id = req.params.id;
  const result = await donationsCollection.deleteOne({
    _id: new ObjectId(id),
  });
  res.send(result);
});
app.patch(
  "/donations/feature/:id",
  verifyFbToken,
  verifyAdmin,
  async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const result = await donationsCollection.updateOne(filter, {
      $set: { isFeatured: true },
    });
    res.send(result);
  }
);
app.get("/donations/featured", async (req, res) => {
  const result = await donationsCollection
    .find({ isFeatured: true })
    .sort({ donated_At: -1 })
    .limit(8)
    .toArray();
  res.send(result);
});

// request donation api
app.post("/requests", verifyFbToken,verifyCharity, async (req, res) => {
  const requestData = req.body;
  const { donationId } = requestData;
  await donationsCollection.updateOne(
    { _id: new ObjectId(donationId) },
    {
      $set: {
        donationStatus: "requested",
        requestedCharityName: requestData.charityName,
        requestedCharityEmail: requestData.charityEmail,
      },
    }
  );
  const result = await requestsCollection.insertOne(requestData);
  res.send(result);
});
app.get(
  "/requests/charity",
  verifyFbToken,
  verifyEmail,
  verifyCharity,
  async (req, res) => {
    const email = req.query.email;
    const query = { charityEmail: email };

    const result = await requestsCollection
      .find(query)
      .sort({ requestedAt: -1 })
      .toArray();
    res.send(result);
  }
);
app.get("/requests", verifyFbToken, verifyAdmin, async (req, res) => {
  const result = await requestsCollection
    .find()
    .sort({ requestedAt: -1 })
    .toArray();
  res.send(result);
});
app.delete("/requests/:id/:donationId", verifyFbToken, async (req, res) => {
  const { id, donationId } = req.params;
  const filter = { _id: new ObjectId(id) };
  const updateStatus = await donationsCollection.updateOne(
    { _id: new ObjectId(donationId) },
    { $set: { donationStatus: "available" } }
  );
  const result = await requestsCollection.deleteOne(filter);
  res.send(result);
});
app.get(
  "/requests/restaurant",
  verifyFbToken,
  verifyEmail,
  verifyRestaurant,
  async (req, res) => {
    const email = req.query.email;
    const result = await requestsCollection
      .find({ restaurantEmail: email })
      .sort({ requestedAt: -1 })
      .toArray();
    res.send(result);
  }
);
app.get("/requests/pickups", verifyFbToken, verifyEmail, async (req, res) => {
  const email = req.query.email;

  try {
    const filter = {
      charityEmail: email,
      status: "accepted",
    };

    const result = await requestsCollection
      .find(filter)
      .sort({ pickedUpAt: -1 })
      .toArray();

    res.send(result);
  } catch (err) {
    console.error("Error fetching picked-up requests:", err);
    res.status(500).send({ message: "Failed to fetch picked up requests" });
  }
});
app.patch("/requests/picked-up/:reqId", verifyFbToken,verifyCharity, async (req, res) => {
  const reqId = req.params.reqId;
  const { donationId } = req.body;
  const requestUpdate = await requestsCollection.updateOne(
    { _id: new ObjectId(reqId) },
    { $set: { status: "Picked Up", pickupTime: new Date().toISOString() } }
  );
  const donationUpdate = await donationsCollection.updateOne(
    { _id: new ObjectId(donationId) },
    { $set: { donationStatus: "Picked Up" } }
  );
  res.send({
    modifiedCount: requestUpdate.modifiedCount + donationUpdate.modifiedCount,
    message: "Pickup confirmed",
  });
});
app.get("/requests/received", verifyFbToken, verifyEmail,verifyCharity, async (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }
  const result = await requestsCollection
    .find({ charityEmail: email, status: "Picked Up" })
    .sort({ requestedAt: -1 })
    .toArray();
  res.send(result);
});
app.get("/requests/latest", async (req, res) => {
  const result = await requestsCollection
    .find()
    .sort({ _id: -1 })
    .limit(3)
    .toArray();
  res.send(result);
});

app.patch("/requests/status/:id", verifyFbToken,verifyRestaurant, async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const { status } = req.body;
  const updatedDoc = {
    $set: { status: status },
  };
  const result = await requestsCollection.updateOne(filter, updatedDoc);
  res.send(result);
});
app.patch(
  "/requests/reject-others/:donationId",
  verifyFbToken,
  async (req, res) => {
    const id = req.params.donationId;
    const { excludeId } = req.body;
    const result = await requestsCollection.updateMany(
      {
        donationId: donationId,
        _id: { $ne: new ObjectId(excludeId) },
        status: "pending",
      },
      { $set: { status: "rejected" } }
    );
    res.send(result);
  }
);

// reviewed api
app.post("/reviews", async (req, res) => {
  const reviewData = req.body;
  const result = await reviewsCollection.insertOne(reviewData);
  res.send(result);
});
app.get("/reviews/:id", verifyFbToken, async (req, res) => {
  const id = req.params.id;
  const filter = { donationId: id };
  const result = await reviewsCollection
    .find(filter)
    .sort({ reviewedAt: -1 })
    .toArray();
  res.send(result);
});
app.get("/my-reviews", verifyFbToken, verifyEmail, async (req, res) => {
  const email = req.query.email;
  const result = await reviewsCollection
    .find({ reviewerEmail: email })
    .toArray();
  res.send(result);
});
app.delete("/my-reviews/:id", verifyFbToken, async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const result = await reviewsCollection.deleteOne(filter);
  res.send(result);
});
// favourites apis
app.post("/favorites", verifyFbToken, verifyEmail, async (req, res) => {
  const { donationId } = req.body;
  const email = req.query.email;
  const exist = await faovouritesCollection.findOne({ email, donationId });
  if (exist) {
    return res.status(400).send({ message: "Already added to favorites" });
  }

  const result = await faovouritesCollection.insertOne({
    email,
    donationId,
  });
  res.send(result);
});
app.get("/favorites", verifyFbToken, async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).send({ message: "Email required" });
  const fovorites = await faovouritesCollection.find({ email }).toArray();
  const donationIds = fovorites.map((fav) => new ObjectId(fav.donationId));
  const donations = await donationsCollection
    .find({ _id: { $in: donationIds } })
    .toArray();
  res.send(donations);
});
app.delete("/favorites", verifyFbToken, async (req, res) => {
  const { email, donationId } = req.query;
  if (!email || !donationId) {
    return res.status(400).send({ message: "Missing parameters" });
  }
  const result = await faovouritesCollection.deleteOne({
    email,
    donationId,
  });
  res.send(result);
});

//jwt token generate
app.post("/jwt", async (req, res) => {
  const { token } = req.body;
  const decoded = await getAuth().verifyIdToken(token);
  const jwtToken = jwt.sign({ email: decoded.email }, process.env.JWT_SECRET, {
    expiresIn: "2d",
  });
  res.send({ token: jwtToken });
});

app.get("/", (req, res) => {
  res.send("Food server is running!");
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
