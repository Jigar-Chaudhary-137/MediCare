const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Profile = require('../models/Profile');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Get profile
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = await Profile.findOne({ user_id: user._id });
    const userObj = user.toObject();
    const profileObj = profile ? profile.toObject() : {};

    res.json({
      ...userObj,
      ...profileObj,
      id: user._id.toString()
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// Update profile
router.put('/', async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const {
      name,
      dob,
      gender,
      blood_group,
      height,
      weight,
      allergies,
      emergency_contact,
      profile_picture
    } = req.body;

    if (name) {
      await User.findByIdAndUpdate(userId, { name: name.trim() });
    }

    const profileUpdates = {};
    if (dob !== undefined) profileUpdates.dob = dob || null;
    if (gender !== undefined) profileUpdates.gender = gender || null;
    if (blood_group !== undefined) profileUpdates.blood_group = blood_group || null;
    if (height !== undefined) profileUpdates.height = height || null;
    if (weight !== undefined) profileUpdates.weight = weight || null;
    if (allergies !== undefined) profileUpdates.allergies = allergies || null;
    if (emergency_contact !== undefined) profileUpdates.emergency_contact = emergency_contact || null;
    if (profile_picture !== undefined) profileUpdates.profile_picture = profile_picture;

    await Profile.findOneAndUpdate(
      { user_id: userId },
      { $set: profileUpdates },
      { upsert: true, new: true }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
