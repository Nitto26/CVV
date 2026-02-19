const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 1. Get the current queue for a doctor
router.get('/queue/:doctorId', async (req, res) => {
    const { data } = await supabase
        .from('appointments')
        .select('*, users(full_name, age_group)')
        .eq('doctor_id', req.params.doctorId)
        .eq('status', 'waiting')
        .order('token_number', { ascending: true });
    res.json(data);
});

// 2. Start consultation (Unlocks privacy)
router.patch('/start-session', async (req, res) => {
    const { appointmentId, doctorId, patientId } = req.body;
    
    // Logic: Mark token as 'in-consult' and log the access for audit
    await supabase.from('appointments').update({ status: 'in-consult' }).eq('id', appointmentId);
    await supabase.from('access_logs').insert([{ viewer_id: doctorId, patient_id: patientId, reason: 'Active Consultation' }]);
    
    res.json({ message: "Session started. Data access authorized." });
});

// 3. Finalize Prescription
router.post('/prescribe', async (req, res) => {
    const { appointmentId, diagnosis, meds, tests, isInpatient } = req.body;
    
    const accessCode = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6-digit code
    
    const { data } = await supabase.from('medical_records').insert([{
        appointment_id: appointmentId,
        diagnosis_code: diagnosis,
        meds_jsonb: meds,
        lab_tests_ordered: tests,
        is_inpatient: isInpatient,
        access_code: accessCode
    }]).select().single();

    res.json({ message: "Prescription synced", accessCode });
});

module.exports = router;