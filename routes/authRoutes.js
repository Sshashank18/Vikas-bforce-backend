const express = require('express');
const router = express.Router();
const User = require('../models/userModel');
const bcrypt = require('bcryptjs');
const passport = require('passport');

// @route   POST /api/auth/signup
// @desc    Register a new user
router.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }
        user = new User({ email, password });
        await user.save();
        res.status(201).json({ msg: 'User registered successfully' });
    } catch (err) {
        res.status(500).send('Server error');
    }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & create session
router.post('/login', (req, res, next) => {
    console.log('Login attempt with body:', req.body);
    passport.authenticate('local', (err, user, info) => {
        if (err) { return next(err); }
        console.log(user);
        if (!user) { return res.status(400).json({ msg: info?.message || 'Invalid credentials' }); }
        req.logIn(user, (err) => {
            if (err) { return next(err); }
            return res.json({ msg: 'Logged in', user: { id: user.id, email: user.email } });
        });
    })(req, res, next);
});

// @route   GET /api/auth/me
// @desc    Get current authenticated user
router.get('/me', (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ msg: 'Not authenticated' });
    }
    const user = req.user;
    res.json({ id: user.id, email: user.email });
});

// @route   POST /api/auth/logout
// @desc    Logout user and destroy session
router.post('/logout', (req, res) => {
    req.logout(() => {
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.json({ msg: 'Logged out' });
        });
    });
});

module.exports = router;