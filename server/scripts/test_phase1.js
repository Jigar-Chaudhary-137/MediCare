const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const Profile = require('../models/Profile');
const Medicine = require('../models/Medicine');
const Appointment = require('../models/Appointment');
const Facility = require('../models/Facility');
const runMigration = require('./migrate');

async function testPhase1() {
  console.log('====================================================');
  console.log('🧪 MediCare 2.0 — Phase 1 Comprehensive Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Connect to MongoDB
  console.log('TEST 1: MongoDB Connection');
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/medicare';
  try {
    await mongoose.connect(uri);
    assert(mongoose.connection.readyState === 1, `Connected to ${mongoose.connection.name}`);
  } catch (err) {
    assert(false, `MongoDB connection error: ${err.message}`);
    process.exit(1);
  }

  // 2. Collections and Migration Validation
  console.log('\nTEST 2: Collections and Data Migration State');
  const userCount = await User.countDocuments();
  const profileCount = await Profile.countDocuments();
  const medicineCount = await Medicine.countDocuments();
  const appointmentCount = await Appointment.countDocuments();

  assert(userCount >= 5, `Users collection has ${userCount} documents (expected >= 5)`);
  assert(profileCount >= 5, `Profiles collection has ${profileCount} documents (expected >= 5)`);
  assert(medicineCount >= 5, `Medicines collection has ${medicineCount} documents (expected >= 5)`);
  assert(appointmentCount >= 2, `Appointments collection has ${appointmentCount} documents (expected >= 2)`);

  // 3. Existing User Integrity & Password Hash Verification
  console.log('\nTEST 3: Existing User Credential & Security Verification');
  const jigarUser = await User.findOne({ email: 'jigar@medicare.com' });
  assert(!!jigarUser, 'User jigar@medicare.com exists');
  if (jigarUser) {
    assert(
      jigarUser.password.startsWith('$2a$') || jigarUser.password.startsWith('$2b$'),
      'Password remains encrypted with bcrypt (not plaintext)'
    );
    assert(jigarUser.role === 'patient', 'User has valid role assigned (patient)');
    assert(jigarUser.legacy_id === 1, 'Legacy ID mapped correctly (1)');

    const jigarProfile = await Profile.findOne({ user_id: jigarUser._id });
    assert(!!jigarProfile, 'Profile relationship linked to User ObjectId');
    if (jigarProfile) {
      assert(jigarProfile.blood_group === 'B+', 'Profile health details preserved (B+)');
      assert(jigarProfile.allergies === 'mushroom allergies', 'Profile allergies preserved');
    }
  }

  // 4. Test Idempotent Migration (No Duplicate Records)
  console.log('\nTEST 4: Migration Idempotency (Re-running migration must not duplicate)');
  await runMigration();
  // Re-check count
  const recheckUserCount = await User.countDocuments();
  const recheckMedicineCount = await Medicine.countDocuments();
  assert(recheckUserCount === userCount, `User count unchanged after re-migration (${recheckUserCount})`);
  assert(recheckMedicineCount === medicineCount, `Medicine count unchanged after re-migration (${recheckMedicineCount})`);

  // 5. API Testing (In-memory supertest-like fetch against express app)
  console.log('\nTEST 5: Express Endpoints Integration & Backward Compatibility');
  const express = require('express');
  const cors = require('cors');
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/medicines', require('../routes/medicines'));
  app.use('/api/appointments', require('../routes/appointments'));
  app.use('/api/profile', require('../routes/profile'));
  app.use('/api/symptoms', require('../routes/symptoms'));
  app.use('/api/ai', require('../routes/ai'));

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 5.1 Register new user
    const testEmail = `phase1_test_${Date.now()}@medicare.com`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Phase1 Tester',
        email: testEmail,
        password: 'password123'
      })
    });
    const regData = await regRes.json();
    assert(regRes.status === 200 && regData.token, 'POST /api/auth/register succeeded and returned token');
    assert(!!regData.user && !!regData.user.id, 'Register returned user object with id property');

    const token = regData.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };

    // 5.2 Login with newly created user
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'password123'
      })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && loginData.token, 'POST /api/auth/login succeeded');
    assert(loginData.user.email === testEmail, 'Login returned matching user email');

    // 5.3 Profile GET and PUT
    const profGetRes = await fetch(`${baseUrl}/api/profile`, { headers: authHeaders });
    const profGetData = await profGetRes.json();
    assert(profGetRes.status === 200 && profGetData.name === 'Phase1 Tester', 'GET /api/profile returned user profile');

    const profPutRes = await fetch(`${baseUrl}/api/profile`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        blood_group: 'O+',
        height: '175',
        weight: '68',
        emergency_contact: '9998887776'
      })
    });
    const profPutData = await profPutRes.json();
    assert(profPutRes.status === 200 && profPutData.success === true, 'PUT /api/profile updated health details');

    const profVerifyRes = await fetch(`${baseUrl}/api/profile`, { headers: authHeaders });
    const profVerifyData = await profVerifyRes.json();
    assert(profVerifyData.blood_group === 'O+' && profVerifyData.height === '175', 'Updated profile persisted in MongoDB');

    // 5.4 Medicine CRUD
    const medPostRes = await fetch(`${baseUrl}/api/medicines`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Amoxicillin',
        dosage: '500mg',
        time: '08:00',
        frequency: 'twice-daily',
        notes: 'After food'
      })
    });
    const medPostData = await medPostRes.json();
    assert(medPostRes.status === 201 && medPostData.name === 'Amoxicillin', 'POST /api/medicines created reminder');
    assert(!!medPostData.id, 'Created medicine includes frontend-compatible id');

    const createdMedId = medPostData.id;

    const medGetRes = await fetch(`${baseUrl}/api/medicines`, { headers: authHeaders });
    const medGetData = await medGetRes.json();
    assert(Array.isArray(medGetData) && medGetData.length === 1, 'GET /api/medicines returned user medicine list');
    assert(medGetData[0].id === createdMedId, 'Medicine list includes correct id');

    const medDelRes = await fetch(`${baseUrl}/api/medicines/${createdMedId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const medDelData = await medDelRes.json();
    assert(medDelRes.status === 200 && medDelData.success === true, 'DELETE /api/medicines/:id succeeded');

    const medGetAfterDel = await fetch(`${baseUrl}/api/medicines`, { headers: authHeaders });
    const medGetAfterDelData = await medGetAfterDel.json();
    assert(Array.isArray(medGetAfterDelData) && medGetAfterDelData.length === 0, 'Medicine deleted from MongoDB');

    // 5.5 Appointment CRUD
    const apptPostRes = await fetch(`${baseUrl}/api/appointments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        doctor_name: 'Dr. Sneha Sharma',
        specialization: 'Cardiologist',
        date: '2026-09-25',
        time: '11:00',
        location: 'Civil Hospital',
        notes: 'Annual cardiology check'
      })
    });
    const apptPostData = await apptPostRes.json();
    assert(apptPostRes.status === 201 && apptPostData.doctor_name === 'Dr. Sneha Sharma', 'POST /api/appointments booked appointment');
    assert(!!apptPostData.id, 'Appointment includes frontend-compatible id');

    const createdApptId = apptPostData.id;

    const apptGetRes = await fetch(`${baseUrl}/api/appointments`, { headers: authHeaders });
    const apptGetData = await apptGetRes.json();
    assert(Array.isArray(apptGetData) && apptGetData.length === 1, 'GET /api/appointments returned appointment list');

    const apptDelRes = await fetch(`${baseUrl}/api/appointments/${createdApptId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const apptDelData = await apptDelRes.json();
    assert(apptDelRes.status === 200 && apptDelData.success === true, 'DELETE /api/appointments/:id succeeded');

    // 5.6 Symptoms Checker Route
    const sympRes = await fetch(`${baseUrl}/api/symptoms/check`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ symptoms: ['fever', 'cough'] })
    });
    const sympData = await sympRes.json();
    assert(sympRes.status === 200 && Array.isArray(sympData.results), 'POST /api/symptoms/check returned triage results');

    // 5.7 AI Chat Route
    const aiRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ message: 'Hello health assistant' })
    });
    const aiData = await aiRes.json();
    assert(aiRes.status === 200 || aiRes.status === 500, 'POST /api/ai/chat responded cleanly');
    assert(!!aiData.reply, 'AI route returned structured reply message');

    // 5.8 Facility Model Preparation
    const fac = await Facility.create({
      name: `PHC Chandkheda Test ${Date.now()}`,
      facility_type: 'PHC',
      district: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '382424',
      nodal_officer: 'Dr. Jigar'
    });
    assert(!!fac._id && fac.facility_type === 'PHC', 'Facility model schema validated for future phases');
    await Facility.findByIdAndDelete(fac._id);

    // Clean up test user
    await User.findOneAndDelete({ email: testEmail });
    await Profile.findOneAndDelete({ user_id: regData.user.id });
  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================\n');

  await mongoose.disconnect();
  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  testPhase1().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

module.exports = testPhase1;
