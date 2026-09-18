const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    dob: {
      type: String,
      default: null
    },
    gender: {
      type: String,
      default: null
    },
    blood_group: {
      type: String,
      default: null
    },
    height: {
      type: String,
      default: null
    },
    weight: {
      type: String,
      default: null
    },
    allergies: {
      type: String,
      default: null
    },
    emergency_contact: {
      type: String,
      default: null
    },
    profile_picture: {
      type: String,
      default: null
    },
    legacy_id: {
      type: Number
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

module.exports = mongoose.model('Profile', profileSchema);
