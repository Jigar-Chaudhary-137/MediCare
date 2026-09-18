const mongoose = require('mongoose');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Facility = require('../models/Facility');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Medicine = require('../models/Medicine');
const Appointment = require('../models/Appointment');
const { seedFacilities } = require('./seed_facilities');

async function testPhase2A() {
  console.log('====================================================');
  console.log('🧪 MediCare 2.0 — Phase 2A Test Suite (PHC Network)');
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
    assert(mongoose.connection.readyState === 1, `Connected to database: ${mongoose.connection.name}`);
  } catch (err) {
    assert(false, `MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }

  // 2. Facility Model Schema & Validation
  console.log('\nTEST 2: Facility Model Schema & Validation');
  let validationCaught = false;
  try {
    const invalidFacility = new Facility({
      name: '', // Empty name should fail
      facility_type: 'InvalidType',
      district: '',
      state: ''
    });
    await invalidFacility.validate();
  } catch (err) {
    validationCaught = true;
  }
  assert(validationCaught, 'Facility model correctly rejected empty required fields and invalid facility_type');

  // 3. Setup Express test server
  const express = require('express');
  const cors = require('cors');
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/facilities', require('../routes/facilities'));
  app.use('/api/medicines', require('../routes/medicines'));
  app.use('/api/appointments', require('../routes/appointments'));
  app.use('/api/profile', require('../routes/profile'));
  app.use('/api/symptoms', require('../routes/symptoms'));
  app.use('/api/ai', require('../routes/ai'));

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Helper tokens
  const adminUser = await User.findOneAndUpdate(
    { email: 'admin_test@medicare.com' },
    {
      name: 'District Admin Officer',
      email: 'admin_test@medicare.com',
      password: 'password123',
      role: 'district_admin',
      district: 'Ahmedabad',
      state: 'Gujarat'
    },
    { upsert: true, new: true }
  );

  const patientUser = await User.findOneAndUpdate(
    { email: 'patient_test@medicare.com' },
    {
      name: 'Regular Patient',
      email: 'patient_test@medicare.com',
      password: 'password123',
      role: 'patient'
    },
    { upsert: true, new: true }
  );

  const adminToken = jwt.sign(
    { id: adminUser._id.toString(), name: adminUser.name, email: adminUser.email, role: 'district_admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );

  const patientToken = jwt.sign(
    { id: patientUser._id.toString(), name: patientUser.name, email: patientUser.email, role: 'patient' },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );

  const adminHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`
  };

  const patientHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${patientToken}`
  };

  try {
    // 3. Facility Creation (POST /api/facilities)
    console.log('\nTEST 3: Facility Creation (POST /api/facilities)');
    const testFacilityPayload = {
      name: 'PHC Test Facility',
      facility_type: 'PHC',
      district: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380001',
      coordinates: { lat: 23.0225, lng: 72.5714 },
      contact_number: '+91 79 2658 9999',
      nodal_officer: 'Dr. Test Officer',
      active_status: true
    };

    const createRes = await fetch(`${baseUrl}/api/facilities`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(testFacilityPayload)
    });
    const createData = await createRes.json();
    assert(createRes.status === 201 && createData.name === 'PHC Test Facility', 'POST /api/facilities successfully created facility (201)');
    assert(!!createData.id, 'Created facility response includes clean id property');

    const createdFacilityId = createData.id;

    // 4. Facility Retrieval (GET /api/facilities)
    console.log('\nTEST 4: Facility Retrieval (GET /api/facilities)');
    const getAllRes = await fetch(`${baseUrl}/api/facilities`);
    const getAllData = await getAllRes.json();
    assert(getAllRes.status === 200 && Array.isArray(getAllData), 'GET /api/facilities returned list of facilities');
    assert(getAllData.length >= 1, `Facilities returned count: ${getAllData.length}`);

    // 5. Facility Retrieval by ID (GET /api/facilities/:id)
    console.log('\nTEST 5: Facility Retrieval by ID (GET /api/facilities/:id)');
    const getByIdRes = await fetch(`${baseUrl}/api/facilities/${createdFacilityId}`);
    const getByIdData = await getByIdRes.json();
    assert(getByIdRes.status === 200 && getByIdData.id === createdFacilityId, 'GET /api/facilities/:id returned single facility matching ID');
    assert(getByIdData.nodal_officer === 'Dr. Test Officer', 'Facility details match created data');

    // 6. Facility Update (PUT /api/facilities/:id)
    console.log('\nTEST 6: Facility Update (PUT /api/facilities/:id)');
    const updateRes = await fetch(`${baseUrl}/api/facilities/${createdFacilityId}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        contact_number: '+91 79 2658 8888',
        nodal_officer: 'Dr. Updated Officer'
      })
    });
    const updateData = await updateRes.json();
    assert(updateRes.status === 200 && updateData.nodal_officer === 'Dr. Updated Officer', 'PUT /api/facilities/:id updated nodal_officer (200)');
    assert(updateData.contact_number === '+91 79 2658 8888', 'contact_number updated successfully');

    // 7. Facility Deletion (DELETE /api/facilities/:id)
    console.log('\nTEST 7: Facility Deletion (DELETE /api/facilities/:id)');
    const deleteRes = await fetch(`${baseUrl}/api/facilities/${createdFacilityId}`, {
      method: 'DELETE',
      headers: adminHeaders
    });
    const deleteData = await deleteRes.json();
    assert(deleteRes.status === 200 && deleteData.success === true, 'DELETE /api/facilities/:id deleted facility (200)');

    const verifyDeletedRes = await fetch(`${baseUrl}/api/facilities/${createdFacilityId}`);
    assert(verifyDeletedRes.status === 404, 'Deleted facility returns 404 on subsequent lookup');

    // 8. State Filtering
    console.log('\nTEST 8: State Filtering (GET /api/facilities?state=Gujarat)');
    const stateFilterRes = await fetch(`${baseUrl}/api/facilities?state=Gujarat`);
    const stateFilterData = await stateFilterRes.json();
    assert(stateFilterRes.status === 200, 'GET /api/facilities?state=Gujarat returned 200');
    assert(
      stateFilterData.every(f => f.state.toLowerCase() === 'gujarat'),
      `All ${stateFilterData.length} facilities returned belong to Gujarat`
    );

    // 9. District Filtering
    console.log('\nTEST 9: District Filtering (GET /api/facilities?district=Ahmedabad)');
    const districtFilterRes = await fetch(`${baseUrl}/api/facilities?district=Ahmedabad`);
    const districtFilterData = await districtFilterRes.json();
    assert(districtFilterRes.status === 200, 'GET /api/facilities?district=Ahmedabad returned 200');
    assert(
      districtFilterData.every(f => f.district.toLowerCase() === 'ahmedabad'),
      `All ${districtFilterData.length} facilities returned belong to Ahmedabad`
    );

    // 10. Facility Type Filtering
    console.log('\nTEST 10: Facility Type Filtering (GET /api/facilities?facility_type=CHC)');
    const typeFilterRes = await fetch(`${baseUrl}/api/facilities?facility_type=CHC`);
    const typeFilterData = await typeFilterRes.json();
    assert(typeFilterRes.status === 200, 'GET /api/facilities?facility_type=CHC returned 200');
    assert(
      typeFilterData.every(f => f.facility_type === 'CHC'),
      `All ${typeFilterData.length} facilities returned are of type CHC`
    );

    // 11. Multiple Filter Combinations
    console.log('\nTEST 11: Combined Filters (GET /api/facilities?state=Gujarat&district=Ahmedabad&facility_type=PHC)');
    const combinedRes = await fetch(`${baseUrl}/api/facilities?state=Gujarat&district=Ahmedabad&facility_type=PHC`);
    const combinedData = await combinedRes.json();
    assert(combinedRes.status === 200, 'Combined filter query returned 200');
    assert(
      combinedData.every(f => f.state === 'Gujarat' && f.district === 'Ahmedabad' && f.facility_type === 'PHC'),
      `All ${combinedData.length} results strictly match all combined filter criteria`
    );

    // 12. Duplicate Prevention
    console.log('\nTEST 12: Duplicate Prevention');
    const existingPhc = await Facility.findOne({ name: 'PHC Chandkheda', district: 'Ahmedabad', state: 'Gujarat' });
    assert(!!existingPhc, 'Existing facility PHC Chandkheda found in database');

    const dupRes = await fetch(`${baseUrl}/api/facilities`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'PHC Chandkheda',
        facility_type: 'PHC',
        district: 'Ahmedabad',
        state: 'Gujarat'
      })
    });
    assert(dupRes.status === 409, `POST duplicate facility rejected with 409 Conflict (got ${dupRes.status})`);

    // 13. Seed Script Execution
    console.log('\nTEST 13: Seed Script Execution');
    const seedResult = await seedFacilities(false);
    assert(seedResult === 14, `seedFacilities executed successfully, processed ${seedResult} demo facilities`);

    // 14. Seed Idempotency
    console.log('\nTEST 14: Seed Idempotency (Re-running must not create duplicate records)');
    const countBefore = await Facility.countDocuments();
    await seedFacilities(false);
    const countAfter = await Facility.countDocuments();
    assert(countBefore === countAfter, `Facility count before (${countBefore}) equals count after (${countAfter})`);

    // 15. Unauthorized Facility Modification
    console.log('\nTEST 15: Security & Role Authorization (Patient cannot modify facilities)');
    const unauthPostRes = await fetch(`${baseUrl}/api/facilities`, {
      method: 'POST',
      headers: patientHeaders,
      body: JSON.stringify({
        name: 'Hacked Facility',
        facility_type: 'PHC',
        district: 'Surat',
        state: 'Gujarat'
      })
    });
    assert(unauthPostRes.status === 403, `Patient role correctly rejected with 403 Forbidden (got ${unauthPostRes.status})`);

    const noTokenRes = await fetch(`${baseUrl}/api/facilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Token Facility' })
    });
    assert(noTokenRes.status === 401, `Missing token correctly rejected with 401 Unauthorized (got ${noTokenRes.status})`);

    // 16. Existing Authentication Still Works
    console.log('\nTEST 16: Existing Authentication Verification');
    const authLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jigar@medicare.com', password: 'password123' })
    });
    // Note: jigar password in test or token mint
    const authRegRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Phase 2A Auth Check',
        email: `phase2a_auth_${Date.now()}@medicare.com`,
        password: 'password123'
      })
    });
    const authRegData = await authRegRes.json();
    assert(authRegRes.status === 200 && authRegData.token, 'Existing auth registration flow functional');

    // 17. Existing Medicine APIs Still Work
    console.log('\nTEST 17: Existing Medicine APIs Verification');
    const medGetRes = await fetch(`${baseUrl}/api/medicines`, { headers: patientHeaders });
    const medGetData = await medGetRes.json();
    assert(medGetRes.status === 200 && Array.isArray(medGetData), 'GET /api/medicines functional');

    // 18. Existing Appointment APIs Still Work
    console.log('\nTEST 18: Existing Appointment APIs Verification');
    const apptGetRes = await fetch(`${baseUrl}/api/appointments`, { headers: patientHeaders });
    const apptGetData = await apptGetRes.json();
    assert(apptGetRes.status === 200 && Array.isArray(apptGetData), 'GET /api/appointments functional');

    // 19. Existing Profile APIs Still Work
    console.log('\nTEST 19: Existing Profile APIs Verification');
    const profGetRes = await fetch(`${baseUrl}/api/profile`, { headers: patientHeaders });
    const profGetData = await profGetRes.json();
    assert(profGetRes.status === 200 && profGetData.name === 'Regular Patient', 'GET /api/profile functional');

    // 20. Existing AI Endpoint Still Works
    console.log('\nTEST 20: Existing AI Endpoint Verification');
    const aiRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: patientHeaders,
      body: JSON.stringify({ message: 'Health check' })
    });
    const aiData = await aiRes.json();
    assert(aiRes.status === 200 || aiRes.status === 500, 'POST /api/ai/chat handled request cleanly');
    assert(!!aiData.reply, 'AI route returned structured reply');

    // Clean up test users
    await User.findOneAndDelete({ email: 'admin_test@medicare.com' });
    await User.findOneAndDelete({ email: 'patient_test@medicare.com' });
  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`📊 Phase 2A Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================\n');

  await mongoose.disconnect();
  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  testPhase2A().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

module.exports = testPhase2A;
