const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Resolve user ID (supports mongo _id, hex string, or legacy integer id)
    let query;
    if (decoded.id) {
      if (mongoose.Types.ObjectId.isValid(decoded.id)) {
        query = { _id: decoded.id };
      } else {
        query = { legacy_id: Number(decoded.id) };
      }
    } else if (decoded._id) {
      query = { _id: decoded._id };
    }

    if (!query) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
    }

    // Load CURRENT user from MongoDB as the single source of truth for authorization
    const user = await User.findOne(query).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found or deactivated' });
    }

    // Populate req.user strictly from the database record
    req.user = {
      id: user._id.toString(),
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role || 'patient',
      facility_id: user.facility_id ? user.facility_id.toString() : null,
      district: user.district || null,
      state: user.state || null
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

// Optional auth middleware: verifies token if provided; passes through if not provided
const optionalAuth = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  return authMiddleware(req, res, next);
};

// Reusable Role Authorization middleware
const authorizeRole = (...allowedRoles) => {
  const roles = allowedRoles.flat();
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Forbidden: Access denied. Role not found.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Access restricted to [${roles.join(', ')}]. Your role is '${req.user.role}'.`
      });
    }
    next();
  };
};

// Reusable Facility Scope verification helper
const checkFacilityAccess = (user, facility) => {
  if (!user || !user.role) {
    return { allowed: false, status: 401, error: 'Unauthorized: User authentication required' };
  }

  const facilityIdStr = facility._id
    ? facility._id.toString()
    : facility.id
    ? facility.id.toString()
    : String(facility);

  // PHC Staff: restricted to assigned facility
  if (user.role === 'phc_staff') {
    if (!user.facility_id || user.facility_id.toString() !== facilityIdStr) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Access denied to facility outside assigned facility scope'
      };
    }
    return { allowed: true };
  }

  // Medical Officer: restricted to assigned facility
  if (user.role === 'medical_officer') {
    if (!user.facility_id || user.facility_id.toString() !== facilityIdStr) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Access denied to facility outside assigned facility scope'
      };
    }
    return { allowed: true };
  }

  // District Admin: restricted to assigned district + state
  if (user.role === 'district_admin') {
    if (!user.district || !user.state) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: District admin has no assigned district/state scope'
      };
    }
    const facilityDistrict = facility.district || '';
    const facilityState = facility.state || '';
    if (
      facilityDistrict.trim().toLowerCase() !== user.district.trim().toLowerCase() ||
      facilityState.trim().toLowerCase() !== user.state.trim().toLowerCase()
    ) {
      return {
        allowed: false,
        status: 403,
        error: `Forbidden: Access denied to facility outside assigned district scope (${user.district}, ${user.state})`
      };
    }
    return { allowed: true };
  }

  // Patient role: no operational access
  if (user.role === 'patient') {
    return {
      allowed: false,
      status: 403,
      error: 'Forbidden: Patients cannot access operational facility controls'
    };
  }

  return { allowed: false, status: 403, error: 'Forbidden: Access denied. Unrecognized role.' };
};

authMiddleware.optionalAuth = optionalAuth;
authMiddleware.authorizeRole = authorizeRole;
authMiddleware.checkFacilityAccess = checkFacilityAccess;

module.exports = authMiddleware;
