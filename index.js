require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const allowedOrigins = [
  'http://localhost:3000',
  'https://my-market-app-topaz.vercel.app',
];

const app = express();

// এটি অবশ্যই app.use(express.json()) এর আগে হতে হবে
app.use(cors({
  origin: function (origin, callback) {
    // origin খালি থাকলে (যেমন পোস্টম্যান বা মোবাইল অ্যাপ) এলাউ করবে
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ Connection Error:", err));

// Product Schema Update (রিভিউ সেকশন যোগ করা হয়েছে)
const productSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  category: String,
  image: String,
  reviews: [
    {
      user: String,
      rating: Number,
      comment: String,
      date: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Cloudinary Configuration (Cloudinary ওয়েবসাইট থেকে এই কী-গুলো পাবে)
cloudinary.config({
  cloud_name: 'your_cloud_name', 
  api_key: 'your_api_key', 
  api_secret: 'your_api_secret'
});

// Multer Storage Setup
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'products',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const upload = multer({ storage: storage });

// --- IMAGE UPLOAD API ---
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    res.json({ url: req.file.path }); // এটি আপলোড হওয়া ছবির URL রিটার্ন করবে
  } catch (err) {
    res.status(500).json({ message: "Image upload failed" });
  }
});

// --- AUTH API ---

// 1. Signup Route
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "User created successfully!" });
  } catch (err) {
    res.status(400).json({ message: "Email already exists!" });
  }
});

// 2. Login Route
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found!" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials!" });

    const token = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, 'secret_key', { expiresIn: '7d' });
    res.json({ token, user: { name: user.name, email: user.email, isAdmin: user.isAdmin } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. Order Schema (দারাজ স্টাইল অর্ডার ট্র্যাকিং)
const orderSchema = new mongoose.Schema({
  customerName: String,
  email: String,
  address: String,
  phone: String,
  items: Array,
  totalAmount: Number,
  status: { type: String, default: 'Pending' }, // Pending, Shipped, Delivered
  orderDate: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// Newsletter Schema
const subscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  subscribedAt: { type: Date, default: Date.now }
});
const Subscriber = mongoose.model('Subscriber', subscriberSchema);

// --- NEWSLETTER API ---
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    const newSubscriber = new Subscriber({ email });
    await newSubscriber.save();
    res.status(201).json({ message: "Subscribed successfully!" });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Email already subscribed!" });
    }
    res.status(500).json({ message: err.message });
  }
});

// ইউজারের ইমেইল অনুযায়ী অর্ডার খোঁজার API (User Dashboard এর জন্য)
app.get('/api/user-orders/:email', async (req, res) => {
  try {
    const orders = await Order.find({ email: req.params.email }).sort({ orderDate: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- REVIEW API ---
// একটি নির্দিষ্ট প্রোডাক্টে রিভিউ যোগ করা
app.post('/api/items/:id/review', async (req, res) => {
  try {
    const { user, rating, comment } = req.body;
    const product = await Product.findById(req.params.id);
    
    if (product) {
      const review = { user, rating: Number(rating), comment };
      product.reviews.push(review);
      await product.save();
      res.status(201).json({ message: "Review added!" });
    } else {
      res.status(404).json({ message: "Product not found" });
    }
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// --- PRODUCT ROUTES ---
app.get('/api/items', async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
});

app.post('/api/items', async (req, res) => {
  const newProduct = new Product(req.body);
  await newProduct.save();
  res.status(201).json(newProduct);
});

app.delete('/api/items/:id', async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

app.put('/api/items/:id', async (req, res) => {
  const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

app.get('/api/items/:id', async (req, res) => {
  const product = await Product.findById(req.params.id);
  res.json(product);
});

// --- ORDER ROUTES ---
// অর্ডার প্লেস করা
app.post('/api/orders', async (req, res) => {
  try {
    const newOrder = new Order(req.body);
    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// সব অর্ডার দেখা (Admin এর জন্য)
app.get('/api/orders', async (req, res) => {
  const orders = await Order.find().sort({ orderDate: -1 });
  res.json(orders);
});

// অর্ডার স্ট্যাটাস আপডেট করা
app.patch('/api/orders/:id', async (req, res) => {
  const { status } = req.body;
  const updatedOrder = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
  res.json(updatedOrder);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
module.exports = app;