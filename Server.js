const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const JWT_SECRET = 'super-secret-key-change-this-in-production';

app.use(express.json());
app.use(cors());

// ==========================================
// 1. DATABASE MODELS (Updated)
// ==========================================
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    bio: { type: String, default: "Hello! I am new here." },
    profilePic: { type: String, default: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150" }, // Default avatar
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});
const User = mongoose.model('User', UserSchema);

const PostSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        text: { type: String, required: true }
    }]
}, { timestamps: true });
const Post = mongoose.model('Post', PostSchema);

// ==========================================
// 2. AUTH MIDDLEWARE
// ==========================================
const auth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Access denied.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (ex) {
        res.status(400).json({ error: 'Invalid token.' });
    }
};

// ==========================================
// 3. API ROUTES
// ==========================================

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: "User registered successfully!" });
    } catch (err) {
        res.status(400).json({ error: "Username already exists" });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET);
    res.json({ token, userId: user._id, username: user.username });
});

// GET A USER'S COMPLETE PROFILE (New Route)
app.get('/api/users/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username })
            .select('-password') // Hide password hash
            .populate('followers', 'username profilePic') // Pull follower details
            .populate('following', 'username profilePic'); // Pull following details
            
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE PROFILE BIO AND PHOTO (New Route)
app.put('/api/profile', auth, async (req, res) => {
    try {
        const { bio, profilePic } = req.body;
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id, 
            { bio, profilePic }, 
            { new: true }
        ).select('-password');
        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/posts', auth, async (req, res) => {
    try {
        const post = new Post({ user: req.user.id, content: req.body.content });
        await post.save();
        res.status(201).json(post);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/posts', async (req, res) => {
    const posts = await Post.find().populate('user', 'username profilePic').sort({ createdAt: -1 });
    res.json(posts);
});

app.post('/api/posts/:id/like', auth, async (req, res) => {
    const post = await Post.findById(req.body.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (post.likes.includes(req.user.id)) {
        post.likes = post.likes.filter(id => id.toString() !== req.user.id);
    } else {
        post.likes.push(req.user.id);
    }
    await post.save();
    res.json(post);
});

app.post('/api/posts/:id/comment', auth, async (req, res) => {
    const post = await Post.findById(req.body.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.comments.push({ user: req.user.id, username: req.user.username, text: req.body.text });
    await post.save();
    res.json(post);
});

app.post('/api/users/follow', auth, async (req, res) => {
    const { targetUserId } = req.body;
    if (req.user.id === targetUserId) return res.status(400).json({ error: "You can't follow yourself" });

    const me = await User.findById(req.user.id);
    const target = await User.findById(targetUserId);

    if (me.following.includes(targetUserId)) {
        me.following = me.following.filter(id => id.toString() !== targetUserId);
        target.followers = target.followers.filter(id => id.toString() !== req.user.id);
    } else {
        me.following.push(targetUserId);
        target.followers.push(req.user.id);
    }
    await me.save();
    await target.save();
    res.json({ message: "Follow status updated" });
});
mongoose.connect('mongodb://127.0.0.1:27017/minisocial')
    .then(() => app.listen(5000, () => console.log('🚀 Backend running on http://127.0.0.1:5000')))
    .catch(err => console.error('Database connection error:', err));
