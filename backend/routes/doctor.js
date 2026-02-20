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

router.post('/prescribe', async (req, res) => {
    // Added isInpatient to the request body
    const { appointmentId, diagnosis, meds, tests, isInpatient } = req.body;

    try {
        // 1. Fetch the IDs from the appointment record
        const { data: appointment, error: fetchError } = await supabase
            .from('appointments')
            .select('patient_id, doctor_id, hospital_id')
            .eq('id', appointmentId)
            .single();

        if (fetchError || !appointment) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        // Generate the 6-digit Pharmacy Handshake Code
        const accessCode = Math.floor(100000 + Math.random() * 900000).toString();

        // 2. Create the Medical Record including the is_inpatient flag
        const { data: record, error: recordError } = await supabase
            .from('medical_records')
            .insert([{
                appointment_id: appointmentId,
                patient_id: appointment.patient_id,
                doctor_id: appointment.doctor_id,
                hospital_id: appointment.hospital_id,
                diagnosis_code: diagnosis,
                meds_jsonb: meds,
                lab_tests_ordered: tests, // Matches your table column name
                is_inpatient: isInpatient || false, // Defaults to false if not provided
                access_code: accessCode
            }])
            .select().single();

        if (recordError) throw recordError;

        // 3. Update the appointment status to 'completed'
        await supabase
            .from('appointments')
            .update({ status: 'finished' })
            .eq('id', appointmentId);

        res.json({ 
            success: true,
            message: "Consultation finalized. Data synced.",
            accessCode: accessCode,
            isInpatient: record.is_inpatient
        });

    } catch (err) {
        res.status(500).json({ error: "Workflow failed", details: err.message });
    }
});

module.exports = router;