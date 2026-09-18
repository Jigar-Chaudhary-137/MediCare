const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const Profile = require('../models/Profile');
const Medicine = require('../models/Medicine');
const Appointment = require('../models/Appointment');

const DB_PATH = path.join(__dirname, '../../data/db.json');

async function runMigration(disconnectOnComplete = false) {
  console.log('🚀 Starting MediCare 2.0 Data Migration to MongoDB...');

  // 1. Validate db.json existence
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ Source database file not found at: ${DB_PATH}`);
    process.exit(1);
  }

  // 2. Validate and parse JSON content
  let rawData;
  try {
    rawData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (err) {
    console.error(`❌ Failed to parse ${DB_PATH}: ${err.message}`);
    process.exit(1);
  }

  const users = rawData.users || [];
  const profiles = rawData.profile || [];
  const medicines = rawData.medicines || [];
  const appointments = rawData.appointments || [];

  console.log(`📊 Records detected in db.json:`);
  console.log(`   - Users: ${users.length}`);
  console.log(`   - Profiles: ${profiles.length}`);
  console.log(`   - Medicines: ${medicines.length}`);
  console.log(`   - Appointments: ${appointments.length}`);

  // 3. Connect to MongoDB if not already connected
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/medicare';
  if (mongoose.connection.readyState !== 1) {
    console.log(`📡 Connecting to MongoDB at: ${mongoUri}`);
    try {
      await mongoose.connect(mongoUri);
      console.log('✅ Connected to MongoDB successfully.');
    } catch (err) {
      console.error(`❌ MongoDB connection failed: ${err.message}`);
      process.exit(1);
    }
  }

  // 4. Migrate Users (upsert by email)
  const legacyToMongoUserIdMap = {};
  let usersMigratedCount = 0;

  for (const u of users) {
    try {
      const emailLower = u.email.toLowerCase().trim();
      const updatedUser = await User.findOneAndUpdate(
        { email: emailLower },
        {
          name: u.name,
          email: emailLower,
          password: u.password,
          role: u.role || 'patient',
          legacy_id: u.id,
          created_at: u.created_at ? new Date(u.created_at) : new Date()
        },
        { upsert: true, new: true }
      );
      legacyToMongoUserIdMap[u.id] = updatedUser._id;
      usersMigratedCount++;
    } catch (err) {
      console.error(`⚠️ Error migrating user ${u.email}: ${err.message}`);
    }
  }

  // 5. Migrate Profiles (upsert by user_id)
  let profilesMigratedCount = 0;
  for (const p of profiles) {
    const mongoUserId = legacyToMongoUserIdMap[p.user_id];
    if (!mongoUserId) {
      console.warn(`⚠️ Skipping profile id ${p.id}: user_id ${p.user_id} not mapped to a User.`);
      continue;
    }
    try {
      await Profile.findOneAndUpdate(
        { user_id: mongoUserId },
        {
          user_id: mongoUserId,
          dob: p.dob || null,
          gender: p.gender || null,
          blood_group: p.blood_group || null,
          height: p.height || null,
          weight: p.weight || null,
          allergies: p.allergies || null,
          emergency_contact: p.emergency_contact || null,
          profile_picture: p.profile_picture || null,
          legacy_id: p.id
        },
        { upsert: true, new: true }
      );
      profilesMigratedCount++;
    } catch (err) {
      console.error(`⚠️ Error migrating profile for user ${p.user_id}: ${err.message}`);
    }
  }

  // 6. Migrate Medicines (upsert by user_id and legacy_id or name/time)
  let medicinesMigratedCount = 0;
  for (const m of medicines) {
    const mongoUserId = legacyToMongoUserIdMap[m.user_id];
    if (!mongoUserId) {
      console.warn(`⚠️ Skipping medicine id ${m.id}: user_id ${m.user_id} not mapped.`);
      continue;
    }
    try {
      await Medicine.findOneAndUpdate(
        {
          user_id: mongoUserId,
          $or: [
            { legacy_id: m.id },
            { name: m.name, time: m.time }
          ]
        },
        {
          user_id: mongoUserId,
          name: m.name,
          dosage: m.dosage,
          time: m.time,
          frequency: m.frequency || 'daily',
          notes: m.notes || '',
          legacy_id: m.id,
          created_at: m.created_at ? new Date(m.created_at) : new Date()
        },
        { upsert: true, new: true }
      );
      medicinesMigratedCount++;
    } catch (err) {
      console.error(`⚠️ Error migrating medicine ${m.name}: ${err.message}`);
    }
  }

  // 7. Migrate Appointments (upsert by user_id and legacy_id or doctor/date/time)
  let appointmentsMigratedCount = 0;
  for (const a of appointments) {
    const mongoUserId = legacyToMongoUserIdMap[a.user_id];
    if (!mongoUserId) {
      console.warn(`⚠️ Skipping appointment id ${a.id}: user_id ${a.user_id} not mapped.`);
      continue;
    }
    try {
      await Appointment.findOneAndUpdate(
        {
          user_id: mongoUserId,
          $or: [
            { legacy_id: a.id },
            { date: a.date, time: a.time, doctor_name: a.doctor_name }
          ]
        },
        {
          user_id: mongoUserId,
          doctor_name: a.doctor_name,
          specialization: a.specialization || '',
          date: a.date,
          time: a.time,
          location: a.location || '',
          status: a.status || 'upcoming',
          notes: a.notes || '',
          legacy_id: a.id,
          created_at: a.created_at ? new Date(a.created_at) : new Date()
        },
        { upsert: true, new: true }
      );
      appointmentsMigratedCount++;
    } catch (err) {
      console.error(`⚠️ Error migrating appointment for doctor ${a.doctor_name}: ${err.message}`);
    }
  }

  console.log('\n=============================================');
  console.log('🎉 MediCare 2.0 Migration Summary:');
  console.log(`   - Users migrated:        ${usersMigratedCount}`);
  console.log(`   - Profiles migrated:     ${profilesMigratedCount}`);
  console.log(`   - Medicines migrated:    ${medicinesMigratedCount}`);
  console.log(`   - Appointments migrated: ${appointmentsMigratedCount}`);
  console.log('=============================================\n');

  if (disconnectOnComplete) {
    await mongoose.disconnect();
    console.log('🔌 MongoDB connection closed gracefully.');
  }
}

if (require.main === module) {
  runMigration(true).catch(err => {
    console.error('Fatal migration error:', err);
    process.exit(1);
  });
}

module.exports = runMigration;
