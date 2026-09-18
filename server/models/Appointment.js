const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    doctor_name: {
      type: String,
      required: [true, 'Doctor name is required'],
      trim: true
    },
    specialization: {
      type: String,
      default: '',
      trim: true
    },
    date: {
      type: String,
      required: [true, 'Date is required']
    },
    time: {
      type: String,
      required: [true, 'Time is required']
    },
    location: {
      type: String,
      default: '',
      trim: true
    },
    status: {
      type: String,
      enum: ['upcoming', 'completed', 'cancelled'],
      default: 'upcoming'
    },
    notes: {
      type: String,
      default: ''
    },
    facility_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Facility',
      default: null
    },
    legacy_id: {
      type: Number,
      index: true
    },
    created_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret.__v;
        return ret;
      }
    }
  }
);

module.exports = mongoose.model('Appointment', appointmentSchema);
