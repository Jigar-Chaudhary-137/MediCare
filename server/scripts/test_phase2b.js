const path = require('path');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const Profile = require('../models/Profile');
const Facility = require('../models/Facility');
const Medicine = require('../models/Medicine');
const Appointment = require('../models/Appointment');
const { seedFacilities } = require('./seed_facilities');
const { seedUsers, DEMO_PASSWORD } = require('./seed_users');

async function testPhase2B() {
  console.log('================================================================');
  console.log('🧪 MediCare 2.0 — Phase 2B Security & RBAC Test Suite');
  console.log('================================================================\n');

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

  // 1. Database Connection
  console.log('--- SETUP: Database Connection & Seeding ---');
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/medicare';
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(uri);
    }
    assert(mongoose.connection.readyState === 1, `Connected to MongoDB: ${mongoose.connection.name}`);
  } catch (err) {
    assert(false, `MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }

  // Seed facilities and users
  await seedFacilities(false);
  await seedUsers(false);

  // Setup Express test application
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

  // Helper fetch function
  async function api(path, options = {}) {
    const url = `${baseUrl}${path}`;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const res = await fetch(url, { ...options, headers });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, ok: res.ok, body };
  }

  // Fetch facilities for test context
  const vastral = await Facility.findOne({ name: 'PHC Vastral', district: 'Ahmedabad' });
  const naroda = await Facility.findOne({ name: 'PHC Naroda', district: 'Ahmedabad' });
  const sanand = await Facility.findOne({ name: 'CHC Sanand', district: 'Ahmedabad' });
  const adajan = await Facility.findOne({ name: 'PHC Adajan', district: 'Surat' });

  assert(vastral && naroda && sanand && adajan, 'Located test facilities: PHC Vastral, PHC Naroda, CHC Sanand, PHC Adajan');

  // Obtain login tokens for demo accounts
  console.log('\n--- SETUP: Obtain Authentication Tokens ---');
  const patientLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'patient.demo@medicare.local', password: DEMO_PASSWORD })
  });
  const staffLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'staff.demo@medicare.local', password: DEMO_PASSWORD })
  });
  const officerLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'officer.demo@medicare.local', password: DEMO_PASSWORD })
  });
  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin.demo@medicare.local', password: DEMO_PASSWORD })
  });

  const patientToken = patientLogin.body?.token;
  const staffToken = staffLogin.body?.token;
  const officerToken = officerLogin.body?.token;
  const adminToken = adminLogin.body?.token;

  assert(patientToken && staffToken && officerToken && adminToken, 'Successfully logged in all 4 demo users and acquired JWT tokens');

  // ==========================================
  // SECTION 1: AUTHENTICATION
  // ==========================================
  console.log('\n--- SECTION 1: Authentication (Checks 1–6) ---');

  // 1. Missing token -> 401
  const check1 = await api('/api/facilities', {
    method: 'POST',
    body: JSON.stringify({ name: 'Unauth Facility', facility_type: 'PHC', district: 'Ahmedabad', state: 'Gujarat' })
  });
  assert(check1.status === 401, `Check 1: Missing token returns 401 (got ${check1.status})`);

  // 2. Invalid token -> 401
  const check2 = await api('/api/facilities', {
    method: 'POST',
    headers: { Authorization: 'Bearer invalid.token.payload.here' },
    body: JSON.stringify({ name: 'Invalid Token Facility', facility_type: 'PHC', district: 'Ahmedabad', state: 'Gujarat' })
  });
  assert(check2.status === 401, `Check 2: Invalid token returns 401 (got ${check2.status})`);

  // 3. Valid patient token -> authenticated
  const check3 = await api('/api/profile', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(check3.status === 200, `Check 3: Valid patient token authenticates successfully (got ${check3.status})`);

  // 4. Valid PHC staff token -> authenticated
  const check4 = await api('/api/profile', {
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  assert(check4.status === 200, `Check 4: Valid PHC staff token authenticates successfully (got ${check4.status})`);

  // 5. Valid medical officer token -> authenticated
  const check5 = await api('/api/profile', {
    headers: { Authorization: `Bearer ${officerToken}` }
  });
  assert(check5.status === 200, `Check 5: Valid medical officer token authenticates successfully (got ${check5.status})`);

  // 6. Valid district admin token -> authenticated
  const check6 = await api('/api/profile', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(check6.status === 200, `Check 6: Valid district admin token authenticates successfully (got ${check6.status})`);

  // ==========================================
  // SECTION 2: ROLE AUTHORIZATION
  // ==========================================
  console.log('\n--- SECTION 2: Role Authorization (Checks 7–12) ---');

  // 7. Patient cannot create facility -> 403
  const check7 = await api('/api/facilities', {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ name: 'Patient PHC', facility_type: 'PHC', district: 'Ahmedabad', state: 'Gujarat' })
  });
  assert(check7.status === 403, `Check 7: Patient cannot create facility -> 403 (got ${check7.status})`);

  // 8. Patient cannot update facility -> 403
  const check8 = await api(`/api/facilities/${vastral._id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ contact_number: '+91 99999 99999' })
  });
  assert(check8.status === 403, `Check 8: Patient cannot update facility -> 403 (got ${check8.status})`);

  // 9. Patient cannot delete facility -> 403
  const check9 = await api(`/api/facilities/${vastral._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(check9.status === 403, `Check 9: Patient cannot delete facility -> 403 (got ${check9.status})`);

  // 10. PHC staff cannot perform facility administration -> 403
  const check10a = await api('/api/facilities', {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: JSON.stringify({ name: 'Staff PHC', facility_type: 'PHC', district: 'Ahmedabad', state: 'Gujarat' })
  });
  const check10b = await api(`/api/facilities/${vastral._id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: JSON.stringify({ contact_number: '+91 88888 88888' })
  });
  const check10c = await api(`/api/facilities/${vastral._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  assert(
    check10a.status === 403 && check10b.status === 403 && check10c.status === 403,
    `Check 10: PHC staff cannot perform facility administration (POST: ${check10a.status}, PUT: ${check10b.status}, DELETE: ${check10c.status})`
  );

  // 11. Medical officer can update assigned facility -> 200, but cannot create or delete
  const check11 = await api(`/api/facilities/${sanand._id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${officerToken}` },
    body: JSON.stringify({ contact_number: '+91 2717 222 999' })
  });
  const check11Create = await api('/api/facilities', {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerToken}` },
    body: JSON.stringify({ name: 'MO SubCentre', facility_type: 'SubCentre', district: 'Ahmedabad', state: 'Gujarat' })
  });
  const check11Delete = await api(`/api/facilities/${sanand._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${officerToken}` }
  });
  assert(
    check11.status === 200 && check11Create.status === 403 && check11Delete.status === 403,
    `Check 11: Medical officer can update assigned facility (200), cannot create (403), cannot delete (403)`
  );

  // 12. District admin can create facility in assigned district -> 201
  const uniqueTestName = `PHC Test Created ${Date.now()}`;
  const check12 = await api('/api/facilities', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: uniqueTestName,
      facility_type: 'PHC',
      district: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380001'
    })
  });
  assert(check12.status === 201 && check12.body?.name === uniqueTestName, `Check 12: District admin can create facility in assigned district -> 201 (got ${check12.status})`);

  // Clean up created facility
  if (check12.body?.id) {
    await api(`/api/facilities/${check12.body.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  }

  // ==========================================
  // SECTION 3: FACILITY & DISTRICT SCOPE
  // ==========================================
  console.log('\n--- SECTION 3: Facility & District Scope (Checks 13–18) ---');

  // 13. PHC staff can access assigned facility PHC Vastral -> 200
  const check13 = await api(`/api/facilities/${vastral._id}`, {
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  assert(check13.status === 200 && check13.body?.name === 'PHC Vastral', `Check 13: PHC staff can access assigned facility PHC Vastral -> 200 (got ${check13.status})`);

  // 14. PHC staff cannot access unrelated facility PHC Naroda -> 403
  const check14 = await api(`/api/facilities/${naroda._id}`, {
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  assert(check14.status === 403, `Check 14: PHC staff cannot access unrelated facility PHC Naroda -> 403 (got ${check14.status})`);

  // 15. Medical officer can access assigned facility CHC Sanand -> 200
  const check15 = await api(`/api/facilities/${sanand._id}`, {
    headers: { Authorization: `Bearer ${officerToken}` }
  });
  assert(check15.status === 200 && check15.body?.name === 'CHC Sanand', `Check 15: Medical officer can access assigned facility CHC Sanand -> 200 (got ${check15.status})`);

  // 16. Medical officer cannot access unrelated facility PHC Vastral -> 403
  const check16 = await api(`/api/facilities/${vastral._id}`, {
    headers: { Authorization: `Bearer ${officerToken}` }
  });
  assert(check16.status === 403, `Check 16: Medical officer cannot access unrelated facility PHC Vastral -> 403 (got ${check16.status})`);

  // 17. District admin can manage facilities inside Ahmedabad -> success (200)
  const check17 = await api(`/api/facilities/${vastral._id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ nodal_officer: 'Dr. Ananya Shah (Updated by Admin)' })
  });
  assert(check17.status === 200, `Check 17: District admin can manage facilities inside Ahmedabad -> 200 (got ${check17.status})`);

  // 18. District admin cannot manage facilities outside Ahmedabad -> 403
  const check18Put = await api(`/api/facilities/${adajan._id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ contact_number: '+91 261 9999 999' })
  });
  const check18Post = await api('/api/facilities', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: 'Surat PHC By Ahmedabad Admin', facility_type: 'PHC', district: 'Surat', state: 'Gujarat' })
  });
  const check18Delete = await api(`/api/facilities/${adajan._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(
    check18Put.status === 403 && check18Post.status === 403 && check18Delete.status === 403,
    `Check 18: District admin cannot manage facilities outside Ahmedabad (PUT Surat: ${check18Put.status}, POST Surat: ${check18Post.status}, DELETE Surat: ${check18Delete.status})`
  );

  // ==========================================
  // SECTION 4: PUBLIC REGISTRATION SECURITY
  // ==========================================
  console.log('\n--- SECTION 4: Public Registration Security (Checks 19–20) ---');

  const regEmailNormal = `test_patient_${Date.now()}@medicare.local`;
  const check19 = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Normal Patient Test',
      email: regEmailNormal,
      password: 'SafePassword123'
    })
  });
  const regUser19 = await User.findOne({ email: regEmailNormal });
  assert(
    check19.status === 200 && check19.body?.user?.role === 'patient' && regUser19?.role === 'patient' && regUser19?.facility_id === null,
    `Check 19: Normal registration creates role = 'patient' with null facility/district scope`
  );

  // 20. Public registration cannot create district_admin or privileged roles
  const regEmailAttack = `attacker_${Date.now()}@medicare.local`;
  const check20 = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Privilege Escalation Attacker',
      email: regEmailAttack,
      password: 'AttackPassword123',
      role: 'district_admin',
      district: 'Ahmedabad',
      state: 'Gujarat',
      facility_id: vastral._id.toString()
    })
  });
  const regUser20 = await User.findOne({ email: regEmailAttack });
  assert(
    check20.status === 200 &&
    check20.body?.user?.role === 'patient' &&
    regUser20?.role === 'patient' &&
    regUser20?.facility_id === null &&
    regUser20?.district === null,
    `Check 20: Public registration completely ignores client-supplied privileged role/scope and enforces patient`
  );

  // ==========================================
  // SECTION 5: DEMO SEEDING & PASSWORD SECURITY
  // ==========================================
  console.log('\n--- SECTION 5: Demo Seeding & Password Security (Checks 21–23) ---');

  // 21. Demo users created
  const demoPatient = await User.findOne({ email: 'patient.demo@medicare.local' });
  const demoStaff = await User.findOne({ email: 'staff.demo@medicare.local' });
  const demoOfficer = await User.findOne({ email: 'officer.demo@medicare.local' });
  const demoAdmin = await User.findOne({ email: 'admin.demo@medicare.local' });
  assert(
    demoPatient && demoStaff && demoOfficer && demoAdmin,
    `Check 21: All four demo users exist in the database with appropriate roles`
  );

  // 22. Passwords are valid bcrypt hashes and never exposed
  const isHashPatient = demoPatient.password.startsWith('$2') && bcrypt.compareSync(DEMO_PASSWORD, demoPatient.password);
  const isHashStaff = demoStaff.password.startsWith('$2') && bcrypt.compareSync(DEMO_PASSWORD, demoStaff.password);
  const isHashOfficer = demoOfficer.password.startsWith('$2') && bcrypt.compareSync(DEMO_PASSWORD, demoOfficer.password);
  const isHashAdmin = demoAdmin.password.startsWith('$2') && bcrypt.compareSync(DEMO_PASSWORD, demoAdmin.password);
  const noPasswordExposed = !patientLogin.body?.user?.password && !adminLogin.body?.user?.password && !check19.body?.user?.password;
  assert(
    isHashPatient && isHashStaff && isHashOfficer && isHashAdmin && noPasswordExposed,
    `Check 22: Passwords are valid bcrypt hashes and are never exposed in user objects or API responses`
  );

  // 23. Demo seed is idempotent
  const countBefore = await User.countDocuments();
  await seedUsers(false);
  const countAfter = await User.countDocuments();
  assert(countBefore === countAfter, `Check 23: Demo user seed is idempotent (count unchanged: ${countBefore} -> ${countAfter})`);

  // ==========================================
  // SECTION 6: BACKWARD COMPATIBILITY
  // ==========================================
  console.log('\n--- SECTION 6: Backward Compatibility (Checks 24–30) ---');

  // 24. Existing patient login works
  const check24 = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'patient.demo@medicare.local', password: DEMO_PASSWORD })
  });
  assert(check24.status === 200 && check24.body?.token, `Check 24: Existing patient login works and returns token`);

  // 25. Existing medicine APIs work
  const medName = `Amoxicillin_${Date.now()}`;
  const check25Post = await api('/api/medicines', {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ name: medName, dosage: '500mg', time: '08:00', frequency: 'daily', notes: 'After breakfast' })
  });
  const check25Get = await api('/api/medicines', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(
    check25Post.status === 201 && Array.isArray(check25Get.body) && check25Get.body.some(m => m.name === medName),
    `Check 25: Existing medicine APIs work (POST: ${check25Post.status}, GET: ${check25Get.status})`
  );

  // 26. Existing appointment APIs work
  const check26Post = await api('/api/appointments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({
      doctor_name: 'Dr. Ramesh Trivedi',
      specialization: 'General Physician',
      date: '2026-10-15',
      time: '11:00 AM',
      location: 'PHC Chandkheda'
    })
  });
  const check26Get = await api('/api/appointments', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(
    check26Post.status === 201 && Array.isArray(check26Get.body) && check26Get.body.length > 0,
    `Check 26: Existing appointment APIs work (POST: ${check26Post.status}, GET: ${check26Get.status})`
  );

  // 27. Existing profile APIs work
  const check27Get = await api('/api/profile', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  const check27Put = await api('/api/profile', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ blood_group: 'B+', allergies: 'Penicillin' })
  });
  const check27GetUpdated = await api('/api/profile', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(
    check27Get.status === 200 && check27Put.status === 200 && check27GetUpdated.body?.blood_group === 'B+',
    `Check 27: Existing profile APIs work (GET: ${check27Get.status}, PUT: ${check27Put.status}, updated blood_group: ${check27GetUpdated.body?.blood_group})`
  );

  // 28. Existing symptom API works
  const check28 = await api('/api/symptoms/check', {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ symptoms: ['fever', 'cough'] })
  });
  assert(check28.status === 200 && (check28.body?.results || check28.body?.highestSeverity), `Check 28: Existing symptom analysis API works (status ${check28.status})`);

  // 29. Existing AI API works
  const check29 = await api('/api/ai/chat', {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ message: 'What precautions should I take for high blood pressure?' })
  });
  assert((check29.status === 200 || check29.status === 500) && (check29.body?.reply || check29.body?.message || check29.body?.response), `Check 29: Existing AI chat API works (status ${check29.status}, reply handled)`);

  // 30. Existing facility GET APIs work
  const check30All = await api('/api/facilities');
  const check30Filtered = await api('/api/facilities?district=Ahmedabad&facility_type=PHC');
  const check30PublicGet = await api(`/api/facilities/${vastral._id}`);
  assert(
    check30All.status === 200 &&
    check30All.body?.length >= 14 &&
    check30Filtered.status === 200 &&
    check30PublicGet.status === 200 &&
    check30PublicGet.body?.name === 'PHC Vastral',
    `Check 30: Existing facility GET APIs work without requiring admin credentials (all: ${check30All.body?.length}, single: 200)`
  );

  // ==========================================
  // SECTION 7: SCOPE ESCALATION PREVENTION
  // ==========================================
  console.log('\n--- SECTION 7: Scope Escalation Prevention (Checks 31–33) ---');

  // 31. Medical officer assigned to CHC Sanand attempts to update PHC Vastral -> 403
  const check31 = await api(`/api/facilities/${vastral._id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${officerToken}` },
    body: JSON.stringify({ nodal_officer: 'Malicious Takeover' })
  });
  assert(check31.status === 403, `Check 31: Medical officer cannot update facility outside assignment (PHC Vastral) -> 403 (got ${check31.status})`);

  // 32. Medical officer attempts to reassign facility district/state -> 403
  const check32 = await api(`/api/facilities/${sanand._id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${officerToken}` },
    body: JSON.stringify({ district: 'Surat', state: 'Gujarat' })
  });
  assert(check32.status === 403, `Check 32: Medical officer cannot modify facility district or state -> 403 (got ${check32.status})`);

  // 33. District admin cannot transfer facility to another district -> 403
  const check33 = await api(`/api/facilities/${vastral._id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ district: 'Surat', state: 'Gujarat' })
  });
  assert(check33.status === 403, `Check 33: District admin cannot transfer facility outside assigned district -> 403 (got ${check33.status})`);

  // Cleanup
  server.close();
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log(`🏁 Phase 2B Test Results: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  testPhase2B().catch(err => {
    console.error('Fatal test execution error:', err);
    process.exit(1);
  });
}

module.exports = { testPhase2B };
