const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// POST /api/v1/hospital/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const { data: hospital, error } = await supabase
            .from('hospitals')
            .select('id, name, district')
            .eq('email', email)
            .eq('password', password) // Simple string match for demo
            .single();

        if (error || !hospital) {
            return res.status(401).json({ error: "Invalid hospital credentials" });
        }

        res.json({
            success: true,
            message: `Welcome, ${hospital.name}`,
            hospitalId: hospital.id,
            hospitalName: hospital.name,
            district: hospital.district
        });

    } catch (err) {
        res.status(500).json({ error: "Login error", details: err.message });
    }
});

// GET /api/v1/hospital/details/:id
router.get('/details/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hospitals')
            .select('id, name, district, email, latitude, longitude')
            .eq('id', req.params.id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: "Hospital profile not found" });
        }

        res.json({
            success: true,
            data: data
        });

    } catch (err) {
        res.status(500).json({ error: "Server error", details: err.message });
    }
});

// GET /api/v1/hospital/stats/:hospitalId
router.get('/stats/:hospitalId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hospital_stats')
            .select('*')
            .eq('hospital_id', req.params.hospitalId)
            .single();

        if (error || !data) return res.status(404).json({ error: "Stats not found" });

        res.json({ success: true, stats: data });
    } catch (err) {
        res.status(500).json({ error: "Fetch error", details: err.message });
    }
});

// POST /api/v1/hospital/update-stats
router.post('/update-stats', async (req, res) => {
    const { hospitalId, ...updateData } = req.body; 
    // updateData should look like: { total_wards: 10, available_beds: 5, ... }

    try {
        const { data, error } = await supabase
            .from('hospital_stats')
            .upsert({
                hospital_id: hospitalId,
                ...updateData,
                updated_at: new Date()
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, message: "Hospital stats updated!", data });
    } catch (err) {
        res.status(500).json({ error: "Update failed", details: err.message });
    }
});

// GET /api/v1/hospital/patient-records/:hospitalId
router.get('/patient-records/:hospitalId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('medical_records')
            .select(`
                id,
                created_at,
                diagnosis_code,
                is_inpatient,
                is_dispensed,
                patient_id,
                users!inner (
                    full_name
                )
            `)
            .eq('hospital_id', req.params.hospitalId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Flattening the data for the frontend table
        const records = data.map(record => ({
            prescriptionId: record.id,
            date: new Date(record.created_at).toLocaleDateString('en-IN'),
            patientName: record.users.full_name,
            diagnosis: record.diagnosis_code,
            status: record.is_inpatient ? 'Inpatient' : 'Outpatient',
            pharmacyStatus: record.is_dispensed ? 'Dispensed' : 'Pending'
        }));

        res.json({
            success: true,
            count: records.length,
            records: records
        });

    } catch (err) {
        res.status(500).json({ error: "Failed to fetch patient history", details: err.message });
    }
});

module.exports = router;