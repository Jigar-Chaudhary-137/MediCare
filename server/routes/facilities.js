const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Facility = require('../models/Facility');
const authMiddleware = require('../middleware/auth');

const VALID_FACILITY_TYPES = ['PHC', 'CHC', 'SubCentre', 'DistrictHospital'];

// Helper to format clean response
function formatFacility(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: obj._id ? obj._id.toString() : obj.id,
    _id: obj._id,
    name: obj.name,
    facility_type: obj.facility_type,
    district: obj.district,
    state: obj.state,
    pincode: obj.pincode || '',
    coordinates: {
      lat: obj.coordinates && typeof obj.coordinates.lat === 'number' ? obj.coordinates.lat : 0,
      lng: obj.coordinates && typeof obj.coordinates.lng === 'number' ? obj.coordinates.lng : 0
    },
    contact_number: obj.contact_number || '',
    nodal_officer: obj.nodal_officer || '',
    active_status: obj.active_status !== undefined ? obj.active_status : true,
    created_at: obj.created_at,
    updated_at: obj.updated_at
  };
}

// ── GET /api/facilities (with filtering) ─────────────────────────────────────
// Public/patient accessible directory
router.get('/', async (req, res) => {
  try {
    const { state, district, facility_type, active, active_status } = req.query;
    const filter = {};

    if (state && state.trim()) {
      filter.state = new RegExp(`^${state.trim()}$`, 'i');
    }

    if (district && district.trim()) {
      filter.district = new RegExp(`^${district.trim()}$`, 'i');
    }

    if (facility_type && facility_type.trim()) {
      filter.facility_type = new RegExp(`^${facility_type.trim()}$`, 'i');
    }

    const activeFilter = active !== undefined ? active : active_status;
    if (activeFilter !== undefined) {
      filter.active_status = activeFilter === 'true' || activeFilter === true;
    }

    const facilities = await Facility.find(filter).sort({ state: 1, district: 1, name: 1 });
    res.json(facilities.map(formatFacility));
  } catch (err) {
    console.error('Get facilities error:', err);
    res.status(500).json({ error: 'Failed to retrieve facilities' });
  }
});

// ── GET /api/facilities/:id ──────────────────────────────────────────────────
// Public/patient lookup allowed; operational users scoped to assigned facility / district
router.get('/:id', authMiddleware.optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Facility not found' });
    }

    const facility = await Facility.findById(id);
    if (!facility) {
      return res.status(404).json({ error: 'Facility not found' });
    }

    // If authenticated operational user, verify facility/district scope
    if (req.user) {
      if (req.user.role === 'phc_staff') {
        if (!req.user.facility_id || req.user.facility_id.toString() !== facility._id.toString()) {
          return res.status(403).json({
            error: 'Forbidden: Access denied to facility outside assigned facility scope'
          });
        }
      } else if (req.user.role === 'medical_officer') {
        if (!req.user.facility_id || req.user.facility_id.toString() !== facility._id.toString()) {
          return res.status(403).json({
            error: 'Forbidden: Access denied to facility outside assigned facility scope'
          });
        }
      } else if (req.user.role === 'district_admin') {
        if (
          !req.user.district ||
          !req.user.state ||
          facility.district.toLowerCase() !== req.user.district.toLowerCase() ||
          facility.state.toLowerCase() !== req.user.state.toLowerCase()
        ) {
          return res.status(403).json({
            error: 'Forbidden: Access denied to facility outside assigned district scope'
          });
        }
      }
      // patient role or unauthenticated: public directory lookup permitted
    }

    res.json(formatFacility(facility));
  } catch (err) {
    console.error('Get facility by id error:', err);
    res.status(500).json({ error: 'Failed to retrieve facility' });
  }
});

// ── POST /api/facilities (District Admin only) ────────────────────────────────
router.post(
  '/',
  authMiddleware,
  authMiddleware.authorizeRole('district_admin'),
  async (req, res) => {
    try {
      const {
        name,
        facility_type,
        district,
        state,
        pincode,
        coordinates,
        contact_number,
        nodal_officer,
        active_status
      } = req.body;

      // 1. Validation: Required fields
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Facility name is required' });
      }
      if (!facility_type || !VALID_FACILITY_TYPES.includes(facility_type)) {
        return res.status(400).json({
          error: `Facility type must be one of: ${VALID_FACILITY_TYPES.join(', ')}`
        });
      }
      if (!district || typeof district !== 'string' || !district.trim()) {
        return res.status(400).json({ error: 'District is required' });
      }
      if (!state || typeof state !== 'string' || !state.trim()) {
        return res.status(400).json({ error: 'State is required' });
      }

      // 2. Scope Enforcement: District Admin can ONLY create inside assigned district and state
      if (
        !req.user.district ||
        !req.user.state ||
        district.trim().toLowerCase() !== req.user.district.trim().toLowerCase() ||
        state.trim().toLowerCase() !== req.user.state.trim().toLowerCase()
      ) {
        return res.status(403).json({
          error: `Forbidden: District admins can only create facilities in their assigned district (${req.user.district}) and state (${req.user.state})`
        });
      }

      // 3. Validation: Coordinates if provided
      let validatedCoordinates = { lat: 0, lng: 0 };
      if (coordinates) {
        if (
          typeof coordinates.lat !== 'number' ||
          typeof coordinates.lng !== 'number' ||
          isNaN(coordinates.lat) ||
          isNaN(coordinates.lng)
        ) {
          return res.status(400).json({ error: 'Coordinates must contain numeric lat and lng' });
        }
        validatedCoordinates = { lat: coordinates.lat, lng: coordinates.lng };
      }

      // 4. Validation: active_status boolean if provided
      const validatedActiveStatus = active_status !== undefined ? Boolean(active_status) : true;

      // 5. Duplicate Check (name + district + state)
      const duplicate = await Facility.findOne({
        name: new RegExp(`^${name.trim()}$`, 'i'),
        district: new RegExp(`^${district.trim()}$`, 'i'),
        state: new RegExp(`^${state.trim()}$`, 'i')
      });

      if (duplicate) {
        return res.status(409).json({
          error: 'A facility with this name already exists in the specified district and state'
        });
      }

      // 6. Create Facility
      const facility = await Facility.create({
        name: name.trim(),
        facility_type,
        district: district.trim(),
        state: state.trim(),
        pincode: pincode ? String(pincode).trim() : '',
        coordinates: validatedCoordinates,
        contact_number: contact_number ? String(contact_number).trim() : '',
        nodal_officer: nodal_officer ? String(nodal_officer).trim() : '',
        active_status: validatedActiveStatus
      });

      res.status(201).json(formatFacility(facility));
    } catch (err) {
      console.error('Create facility error:', err);
      if (err.code === 11000) {
        return res.status(409).json({
          error: 'Facility with this name already exists in this district and state'
        });
      }
      res.status(500).json({ error: 'Failed to create facility' });
    }
  }
);

// ── PUT /api/facilities/:id (District Admin & Medical Officer) ───────────────
router.put(
  '/:id',
  authMiddleware,
  authMiddleware.authorizeRole('district_admin', 'medical_officer'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ error: 'Facility not found' });
      }

      const facility = await Facility.findById(id);
      if (!facility) {
        return res.status(404).json({ error: 'Facility not found' });
      }

      // SCOPE ENFORCEMENT
      if (req.user.role === 'medical_officer') {
        // Medical officer can only update their assigned facility
        if (!req.user.facility_id || req.user.facility_id.toString() !== facility._id.toString()) {
          return res.status(403).json({
            error: 'Forbidden: Medical officers can only update their assigned facility'
          });
        }
        // Medical officer cannot reassign facility district or state
        if (
          (req.body.district &&
            req.body.district.trim().toLowerCase() !== facility.district.toLowerCase()) ||
          (req.body.state && req.body.state.trim().toLowerCase() !== facility.state.toLowerCase())
        ) {
          return res.status(403).json({
            error: 'Forbidden: Medical officers cannot modify facility district or state'
          });
        }
      } else if (req.user.role === 'district_admin') {
        // District admin can only update facilities within their assigned district and state
        if (
          !req.user.district ||
          !req.user.state ||
          facility.district.toLowerCase() !== req.user.district.toLowerCase() ||
          facility.state.toLowerCase() !== req.user.state.toLowerCase()
        ) {
          return res.status(403).json({
            error:
              'Forbidden: District admins can only update facilities in their assigned district and state'
          });
        }
        // District admin cannot transfer facility outside their assigned district and state
        if (
          (req.body.district &&
            req.body.district.trim().toLowerCase() !== req.user.district.toLowerCase()) ||
          (req.body.state && req.body.state.trim().toLowerCase() !== req.user.state.toLowerCase())
        ) {
          return res.status(403).json({
            error:
              'Forbidden: Cannot transfer facility outside your assigned district and state scope'
          });
        }
      }

      const {
        name,
        facility_type,
        district,
        state,
        pincode,
        coordinates,
        contact_number,
        nodal_officer,
        active_status
      } = req.body;

      const updates = {};

      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({ error: 'Facility name cannot be empty' });
        }
        updates.name = name.trim();
      }

      if (facility_type !== undefined) {
        if (!VALID_FACILITY_TYPES.includes(facility_type)) {
          return res.status(400).json({
            error: `Facility type must be one of: ${VALID_FACILITY_TYPES.join(', ')}`
          });
        }
        updates.facility_type = facility_type;
      }

      if (district !== undefined) {
        if (typeof district !== 'string' || !district.trim()) {
          return res.status(400).json({ error: 'District cannot be empty' });
        }
        updates.district = district.trim();
      }

      if (state !== undefined) {
        if (typeof state !== 'string' || !state.trim()) {
          return res.status(400).json({ error: 'State cannot be empty' });
        }
        updates.state = state.trim();
      }

      if (pincode !== undefined) {
        updates.pincode = String(pincode).trim();
      }

      if (coordinates !== undefined) {
        if (
          typeof coordinates.lat !== 'number' ||
          typeof coordinates.lng !== 'number' ||
          isNaN(coordinates.lat) ||
          isNaN(coordinates.lng)
        ) {
          return res.status(400).json({ error: 'Coordinates must contain numeric lat and lng' });
        }
        updates.coordinates = { lat: coordinates.lat, lng: coordinates.lng };
      }

      if (contact_number !== undefined) {
        updates.contact_number = String(contact_number).trim();
      }

      if (nodal_officer !== undefined) {
        updates.nodal_officer = String(nodal_officer).trim();
      }

      if (active_status !== undefined) {
        updates.active_status = Boolean(active_status);
      }

      // Check duplicate collision if name/district/state updated
      const checkName = updates.name || facility.name;
      const checkDistrict = updates.district || facility.district;
      const checkState = updates.state || facility.state;

      const collision = await Facility.findOne({
        _id: { $ne: facility._id },
        name: new RegExp(`^${checkName}$`, 'i'),
        district: new RegExp(`^${checkDistrict}$`, 'i'),
        state: new RegExp(`^${checkState}$`, 'i')
      });

      if (collision) {
        return res.status(409).json({
          error:
            'Another facility with this name already exists in the specified district and state'
        });
      }

      const updated = await Facility.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
      );

      res.json(formatFacility(updated));
    } catch (err) {
      console.error('Update facility error:', err);
      res.status(500).json({ error: 'Failed to update facility' });
    }
  }
);

// ── DELETE /api/facilities/:id (District Admin only) ─────────────────────────
router.delete(
  '/:id',
  authMiddleware,
  authMiddleware.authorizeRole('district_admin'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ error: 'Facility not found' });
      }

      const facility = await Facility.findById(id);
      if (!facility) {
        return res.status(404).json({ error: 'Facility not found' });
      }

      // District scope enforcement: District Admin can ONLY delete inside their assigned district and state
      if (
        !req.user.district ||
        !req.user.state ||
        facility.district.toLowerCase() !== req.user.district.toLowerCase() ||
        facility.state.toLowerCase() !== req.user.state.toLowerCase()
      ) {
        return res.status(403).json({
          error:
            'Forbidden: District admins can only delete facilities in their assigned district and state'
        });
      }

      const deleted = await Facility.findByIdAndDelete(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Facility not found' });
      }

      res.json({ success: true, message: 'Facility deleted successfully' });
    } catch (err) {
      console.error('Delete facility error:', err);
      res.status(500).json({ error: 'Failed to delete facility' });
    }
  }
);

module.exports = router;
