const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Medicine = require('../models/Medicine');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Get all medicines for user
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const medicines = await Medicine.find({ user_id: userId }).sort({ time: 1 });

    const formattedMedicines = medicines.map(m => {
      const obj = m.toObject();
      return {
        ...obj,
        id: m._id.toString(),
        user_id: m.user_id.toString()
      };
    });

    res.json(formattedMedicines);
  } catch (err) {
    console.error('Get medicines error:', err);
    res.status(500).json({ error: 'Failed to retrieve medicines' });
  }
});

// Add medicine
router.post('/', async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { name, dosage, time, frequency, notes } = req.body;
    if (!name || !dosage || !time) {
      return res.status(400).json({ error: 'Name, dosage and time are required' });
    }

    const med = await Medicine.create({
      user_id: userId,
      name: name.trim(),
      dosage: dosage.trim(),
      time,
      frequency: frequency || 'daily',
      notes: notes ? notes.trim() : ''
    });

    const obj = med.toObject();
    res.status(201).json({
      ...obj,
      id: med._id.toString(),
      user_id: med.user_id.toString()
    });
  } catch (err) {
    console.error('Add medicine error:', err);
    res.status(500).json({ error: 'Failed to add medicine' });
  }
});

// Delete medicine
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const idParam = req.params.id;

    const query = {
      user_id: userId,
      ...(mongoose.Types.ObjectId.isValid(idParam)
        ? { _id: idParam }
        : { legacy_id: Number(idParam) || -1 })
    };

    const deleted = await Medicine.findOneAndDelete(query);
    if (!deleted) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete medicine error:', err);
    res.status(500).json({ error: 'Failed to delete medicine' });
  }
});

module.exports = router;
