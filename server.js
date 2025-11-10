const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');

const app = express();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());

// DB Config
const db = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(db)
    .then(() => console.log('MongoDB Connected...'))
    .catch(err => console.log(err));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // set true if serving over HTTPS
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 5 // 5 hours
    },
    store: MongoStore.create({ mongoUrl: db })
}));

// Passport setup
require('./services/passport');
app.use(passport.initialize());
app.use(passport.session());

// Use Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tshirts', require('./routes/tshirtRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/instagramPosts', require('./routes/instagramRoutes'));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));