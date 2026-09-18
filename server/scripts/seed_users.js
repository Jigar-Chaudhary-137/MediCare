const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const Profile = require('../models/Profile');
const Facility = require('../models/Facility');
const { seedFacilities } = require('./seed_facilities');

const DEMO_PASSWORD = 'Demo@MediCare2026';

const DEMO_USER_SPECS = [
  {
    name: 'Ramesh Patel (Demo Patient)',
    email: 'patient.demo@medicare.local',
    role: 'patient',
    facilityName: null,
    district: null,
    state: null
  },
  {
    name: 'Priya Sharma (PHC Staff)',
    email: 'staff.demo@medicare.local',
    role: 'phc_staff',
    facilityName: 'PHC Vastral',
    district: 'Ahmedabad',
    state: 'Gujarat'
  },
  {
    name: 'Dr. Snehal Dave (Medical Officer)',
    email: 'officer.demo@medicare.local',
    role: 'medical_officer',
    facilityName: 'CHC Sanand',
    district: 'Ahmedabad',
    state: 'Gujarat'
  },
  {
    name: 'Dr. Vikram Mehta (District Admin)',
    email: 'admin.demo@medicare.local',
    role: 'district_admin',
    facilityName: null,
    district: 'Ahmedabad',
    state: 'Gujarat'
  }
];

async function seedUsers(disconnectOnComplete = false) {
  console.log('👥 Seeding RBAC Demo Users (Phase 2B)...');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/medicare';
  if (mongoose.connection.readyState !== 1) {
    console.log(`📡 Connecting to MongoDB at: ${mongoUri}`);
    try {
      await mongoose.connect(mongoUri);
      console.log('✅ Connected to MongoDB.');
    } catch (err) {
      console.error(`❌ MongoDB connection failed: ${err.message}`);
      process.exit(1);
    }
  }

  // Ensure prerequisite demo facilities are present
  const facilityCount = await Facility.countDocuments();
  if (facilityCount === 0) {
    console.log('ℹ️ No facilities found. Running seedFacilities first...');
    await seedFacilities(false);
  }

  // Pre-fetch assigned facilities
  const vastral = await Facility.findOne({ name: 'PHC Vastral', district: 'Ahmedabad', state: 'Gujarat' });
  const sanand = await Facility.findOne({ name: 'CHC Sanand', district: 'Ahmedabad', state: 'Gujarat' });

  if (!vastral || !sanand) {
    console.log('⚠️ Could not locate Vastral or Sanand facility, re-seeding demo facilities...');
    await seedFacilities(false);
  }

  const refreshedVastral = await Facility.findOne({ name: 'PHC Vastral', district: 'Ahmedabad', state: 'Gujarat' });
  const refreshedSanand = await Facility.findOne({ name: 'CHC Sanand', district: 'Ahmedabad', state: 'Gujarat' });

  const facilityMap = {
    'PHC Vastral': refreshedVastral ? refreshedVastral._id : null,
    'CHC Sanand': refreshedSanand ? refreshedSanand._id : null
  };

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const seededUsers = [];

  for (const spec of DEMO_USER_SPECS) {
    const facilityId = spec.facilityName ? facilityMap[spec.facilityName] || null : null;

    const userData = {
      name: spec.name,
      email: spec.email.toLowerCase().trim(),
      password: passwordHash,
      role: spec.role,
      facility_id: facilityId,
      district: spec.district,
      state: spec.state
    };

    // Idempotent upsert
    const user = await User.findOneAndUpdate(
      { email: userData.email },
      { $set: userData },
      { upsert: true, new: true, runValidators: true }
    );

    // Ensure associated profile exists
    await Profile.findOneAndUpdate(
      { user_id: user._id },
      { $setOnInsert: { user_id: user._id } },
      { upsert: true }
    );

    seededUsers.push(user);
  }

  console.log('\n================================================================');
  console.log('🎉 Phase 2B Demo Users Successfully Seeded (Idempotent)');
  console.log('================================================================');
  console.log(`Common Demo Password (DEMO ONLY): ${DEMO_PASSWORD}\n`);

  for (const u of seededUsers) {
    const scopeStr = u.facility_id
      ? `Facility: ${u.facility_id} (${u.district}, ${u.state})`
      : u.district
      ? `District: ${u.district}, ${u.state}`
      : 'Personal / Patient Scope';
    console.log(`👤 Role: [${u.role.padEnd(15)}] | Email: ${u.email.padEnd(28)} | ${scopeStr}`);
  }
  console.log('================================================================\n');

  if (disconnectOnComplete) {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected.');
  }

  return seededUsers;
}

if (require.main === module) {
  seedUsers(true).catch(err => {
    console.error('Fatal user seeding error:', err);
    process.exit(1);
  });
}

module.exports = { seedUsers, DEMO_PASSWORD, DEMO_USER_SPECS };
