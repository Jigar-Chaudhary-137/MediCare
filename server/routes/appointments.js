const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Get all appointments
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const appointments = await Appointment.find({ user_id: userId }).sort({ date: 1, time: 1 });

    const formatted = appointments.map(a => {
      const obj = a.toObject();
      return {
        ...obj,
        id: a._id.toString(),
        user_id: a.user_id.toString()
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('Get appointments error:', err);
    res.status(500).json({ error: 'Failed to retrieve appointments' });
  }
});

// Book appointment
router.post('/', async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { doctor_name, specialization, date, time, location, notes } = req.body;
    if (!doctor_name || !date || !time) {
      return res.status(400).json({ error: 'Doctor name, date and time are required' });
    }

    const appt = await Appointment.create({
      user_id: userId,
      doctor_name: doctor_name.trim(),
      specialization: specialization ? specialization.trim() : '',
      date,
      time,
      location: location ? location.trim() : '',
      notes: notes ? notes.trim() : '',
      status: 'upcoming'
    });

    const obj = appt.toObject();
    res.status(201).json({
      ...obj,
      id: appt._id.toString(),
      user_id: appt.user_id.toString()
    });
  } catch (err) {
    console.error('Book appointment error:', err);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

// Delete appointment
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

    const deleted = await Appointment.findOneAndDelete(query);
    if (!deleted) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete appointment error:', err);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

module.exports = router;
