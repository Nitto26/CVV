const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Import Route Files
const patientRoutes = require('./routes/patient');
const doctorRoutes = require('./routes/doctor');
const hospitalRoutes = require('./routes/hospital');
const pharmacyRoutes = require('./routes/pharmacy');
const researchRoutes = require('./routes/research');
const authRoutes = require('./routes/auth');

// Link the URLs
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/patient', patientRoutes);
app.use('/api/v1/doctor', doctorRoutes);
app.use('/api/v1/hospital', hospitalRoutes);
app.use('/api/v1/pharmacy', pharmacyRoutes);
app.use('/api/v1/research', researchRoutes);

const PORT = 5000;
// Root route for connectivity test
app.get('/', (req, res) => {
	res.send('H-Sync API Server is running!');
});

app.listen(PORT, () => console.log(`🚀 H-Sync Connected Engine running on port ${PORT}`));