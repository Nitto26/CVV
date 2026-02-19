const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 1. GET DOCTOR'S LIVE QUEUE
router.get('/queue/:staffId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .select(`
                id, 
                token_number, 
                status, 
                patient_id,
                users (full_name, age_group)
            `)
            .eq('doctor_id', req.params.staffId)
            .eq('status', 'waiting') // Shows only pending patients
            .order('token_number', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. UPDATE PATIENT STATUS (Call Next Patient)
router.patch('/update-status', async (req, res) => {
    const { appointmentId, status } = req.body; // status: 'in-consult' or 'completed'

    try {
        const { data, error } = await supabase
            .from('appointments')
            .update({ status: status })
            .eq('id', appointmentId)
            .select()
            .single();

        if (error) throw error;
        res.json({ message: `Status updated to ${status}`, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. FINALIZE CONSULTATION & PRESCRIBE
// This creates the 6-digit access code for the Pharmacist
router.post('/prescribe', async (req, res) => {
    const { appointmentId, patientId, staffId, hospitalId, diagnosis, meds, tests } = req.body;

    // Generate a random 6-digit code (The Handshake)
    const accessCode = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        // 1. Create the Medical Record
        const { data: record, error: recordError } = await supabase
            .from('medical_records')
            .insert([{
                patient_id: patientId,
                doctor_id: staffId,
                hospital_id: hospitalId,
                diagnosis_code: diagnosis,
                meds_jsonb: meds, // Expecting array: [{name: "Paracetamol", dosage: "500mg"}]
                lab_tests: tests,
                access_code: accessCode
            }])
            .select()
            .single();

        if (recordError) throw recordError;

        // 2. Mark Appointment as Completed
        await supabase
            .from('appointments')
            .update({ status: 'completed' })
            .eq('id', appointmentId);

        res.json({ 
            message: "Prescription Finalized", 
            accessCode: accessCode, 
            recordId: record.id 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;