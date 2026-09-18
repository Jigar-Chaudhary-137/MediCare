const mongoose = require('mongoose');

const facilitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Facility name is required'],
      trim: true
    },
    facility_type: {
      type: String,
      enum: ['PHC', 'CHC', 'SubCentre', 'DistrictHospital'],
      required: [true, 'Facility type is required']
    },
    district: {
      type: String,
      required: [true, 'District is required'],
      trim: true
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true
    },
    pincode: {
      type: String,
      default: '',
      trim: true
    },
    coordinates: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 }
    },
    contact_number: {
      type: String,
      default: '',
      trim: true
    },
    nodal_officer: {
      type: String,
      default: '',
      trim: true
    },
    active_status: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
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

// Indexes
facilitySchema.index({ name: 1, district: 1, state: 1 }, { unique: true });
facilitySchema.index({ state: 1, district: 1 });
facilitySchema.index({ facility_type: 1 });
facilitySchema.index({ active_status: 1 });

module.exports = mongoose.model('Facility', facilitySchema);
