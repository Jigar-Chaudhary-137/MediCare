const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Facility = require('../models/Facility');

const DEMO_FACILITIES = [
  // ── Gujarat: Ahmedabad ──
  {
    name: 'PHC Chandkheda',
    facility_type: 'PHC',
    district: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '382424',
    coordinates: { lat: 23.1118, lng: 72.5855 },
    contact_number: '+91 79 2750 1201',
    nodal_officer: 'Dr. Ramesh Trivedi',
    active_status: true
  },
  {
    name: 'PHC Vastral',
    facility_type: 'PHC',
    district: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '382418',
    coordinates: { lat: 22.9984, lng: 72.6562 },
    contact_number: '+91 79 2297 3402',
    nodal_officer: 'Dr. Ananya Shah',
    active_status: true
  },
  {
    name: 'PHC Naroda',
    facility_type: 'PHC',
    district: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '382330',
    coordinates: { lat: 23.0673, lng: 72.6578 },
    contact_number: '+91 79 2281 5603',
    nodal_officer: 'Dr. Bhavin Patel',
    active_status: true
  },
  {
    name: 'CHC Sanand',
    facility_type: 'CHC',
    district: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '382110',
    coordinates: { lat: 22.9927, lng: 72.3789 },
    contact_number: '+91 2717 222 104',
    nodal_officer: 'Dr. Snehal Dave',
    active_status: true
  },

  // ── Gujarat: Surat ──
  {
    name: 'PHC Adajan',
    facility_type: 'PHC',
    district: 'Surat',
    state: 'Gujarat',
    pincode: '395009',
    coordinates: { lat: 21.1959, lng: 72.7933 },
    contact_number: '+91 261 2780 905',
    nodal_officer: 'Dr. Kirit Desai',
    active_status: true
  },
  {
    name: 'PHC Udhna',
    facility_type: 'PHC',
    district: 'Surat',
    state: 'Gujarat',
    pincode: '394210',
    coordinates: { lat: 21.1561, lng: 72.8406 },
    contact_number: '+91 261 2275 806',
    nodal_officer: 'Dr. Meena Choksi',
    active_status: true
  },

  // ── Gujarat: Rajkot ──
  {
    name: 'PHC Gondal',
    facility_type: 'PHC',
    district: 'Rajkot',
    state: 'Gujarat',
    pincode: '360311',
    coordinates: { lat: 21.9619, lng: 70.7997 },
    contact_number: '+91 2825 220 707',
    nodal_officer: 'Dr. Hardik Jadeja',
    active_status: true
  },
  {
    name: 'CHC Kalavad',
    facility_type: 'CHC',
    district: 'Rajkot',
    state: 'Gujarat',
    pincode: '361160',
    coordinates: { lat: 22.2131, lng: 70.3788 },
    contact_number: '+91 2894 222 808',
    nodal_officer: 'Dr. Pranav Shukla',
    active_status: true
  },

  // ── Maharashtra: Pune ──
  {
    name: 'PHC Wagholi',
    facility_type: 'PHC',
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '412207',
    coordinates: { lat: 18.5793, lng: 73.9822 },
    contact_number: '+91 20 2705 1909',
    nodal_officer: 'Dr. Sunita Kulkarni',
    active_status: true
  },
  {
    name: 'PHC Hinjawadi',
    facility_type: 'PHC',
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '411057',
    coordinates: { lat: 18.5913, lng: 73.7389 },
    contact_number: '+91 20 2293 4010',
    nodal_officer: 'Dr. Sachin Patil',
    active_status: true
  },
  {
    name: 'CHC Baramati',
    facility_type: 'CHC',
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '413102',
    coordinates: { lat: 18.1517, lng: 74.5772 },
    contact_number: '+91 2112 222 011',
    nodal_officer: 'Dr. Rajesh Deshmukh',
    active_status: true
  },

  // ── Maharashtra: Nashik ──
  {
    name: 'PHC Panchavati',
    facility_type: 'PHC',
    district: 'Nashik',
    state: 'Maharashtra',
    pincode: '422003',
    coordinates: { lat: 20.0112, lng: 73.7909 },
    contact_number: '+91 253 2512 312',
    nodal_officer: 'Dr. Vandana Shinde',
    active_status: true
  },

  // ── Karnataka: Bengaluru Urban ──
  {
    name: 'PHC Whitefield',
    facility_type: 'PHC',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    pincode: '560066',
    coordinates: { lat: 12.9698, lng: 77.7500 },
    contact_number: '+91 80 2845 2313',
    nodal_officer: 'Dr. Vinay Hegde',
    active_status: true
  },

  // ── Karnataka: Mysuru ──
  {
    name: 'PHC Nanjangud',
    facility_type: 'PHC',
    district: 'Mysuru',
    state: 'Karnataka',
    pincode: '571301',
    coordinates: { lat: 12.1197, lng: 76.6806 },
    contact_number: '+91 8221 226 014',
    nodal_officer: 'Dr. Roopa Gowda',
    active_status: true
  }
];

async function seedFacilities(disconnectOnComplete = false) {
  console.log('🌱 Seeding Realistic Demonstration Healthcare Network (Phase 2A)...');

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

  let seededCount = 0;
  for (const item of DEMO_FACILITIES) {
    try {
      await Facility.findOneAndUpdate(
        {
          name: item.name,
          district: item.district,
          state: item.state
        },
        { $set: item },
        { upsert: true, new: true, runValidators: true }
      );
      seededCount++;
    } catch (err) {
      console.error(`⚠️ Error seeding facility ${item.name}: ${err.message}`);
    }
  }

  console.log('\n=============================================');
  console.log(`🎉 Demo Facilities Seeded/Updated: ${seededCount} of ${DEMO_FACILITIES.length}`);
  console.log('   States: Gujarat, Maharashtra, Karnataka');
  console.log('   Districts: Ahmedabad, Surat, Rajkot, Pune, Nashik, Bengaluru Urban, Mysuru');
  console.log('=============================================\n');

  if (disconnectOnComplete) {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected.');
  }

  return seededCount;
}

if (require.main === module) {
  seedFacilities(true).catch(err => {
    console.error('Fatal seeding error:', err);
    process.exit(1);
  });
}

module.exports = { seedFacilities, DEMO_FACILITIES };
