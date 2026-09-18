require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

const publicPath = path.join(__dirname, '../public');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(publicPath));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/medicines', require('./routes/medicines'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/symptoms', require('./routes/symptoms'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/facilities', require('./routes/facilities'));

// Health check
app.get('/health', (req, res) => res.send('OK'));

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(publicPath, 'index.html'));
  }
});

// Connect to DB then start server
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🏥 MediCare 2.0 running on port ${PORT}`);
    });
  } catch (err) {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

startServer();