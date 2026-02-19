const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 1. AI TRIAGE & ROUTING
// Takes raw text -> AI determines Specialization -> DB finds Doctors
router.post('/diagnose', async (req, res) => {
    try {
        const { symptomText, district } = req.body;

        // Groq AI Logic for lightning-fast triage
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a hospital routing assistant. You must return ONLY valid JSON."
                },
                {
                    role: "user",
                    content: `Patient symptoms: "${symptomText}". 
                    Identify the required specialization from: [General Medicine, Cardiology, Pediatrics, Dermatology, Orthopedics, Neurology].
                    Return JSON: {"spec": "String", "urgency": 1-10, "advice": "One sentence safety advice"}`
                }
            ],
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" }
        });

        const aiData = JSON.parse(chatCompletion.choices[0].message.content);

        // Fetch doctors based on AI suggestion + user location
        let query = supabase
            .from('staff')
            .select('*, hospitals(name, district, hospital_type)')
            .eq('specialization', aiData.spec)
            .eq('is_available', true);

        if (district) {
            query = query.ilike('hospitals.district', district);
        }

        const { data: doctors } = await query;

        res.json({ 
            aiAnalysis: aiData, 
            recommendedDoctors: doctors 
        });
    } catch (err) {
        res.status(500).json({ error: "AI routing failed", details: err.message });
    }
});

// 2. TOKEN BOOKING (The Live Sync)
// Creates a token and notifies the hospital system
router.post('/book-token', async (req, res) => {
    const { patientId, staffId } = req.body;

    try {
        // 1. Automatically find the Hospital ID linked to this Staff member
        const { data: staffMember, error: staffError } = await supabase
            .from('staff')
            .select('hospital_id')
            .eq('id', staffId)
            .single();

        if (staffError || !staffMember) throw new Error("Doctor not found");

        // 2. Insert the appointment using the found Hospital ID
        const { data, error } = await supabase
            .from('appointments')
            .insert([{ 
                patient_id: patientId, 
                doctor_id: staffId, // This is the ID from the Staff table
                hospital_id: staffMember.hospital_id, // Found automatically!
                status: 'waiting' 
            }])
            .select()
            .single();

        if (error) throw error;
        res.json({ message: "Token generated successfully", tokenData: data });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 3. PERSONAL HEALTH HISTORY
// Securely retrieves the patient's past prescriptions and lab results
router.get('/my-history/:patientId', async (req, res) => {
    const { data, error } = await supabase
        .from('medical_records')
        .select(`
            *,
            hospitals(name),
            lab_results(*)
        `)
        .eq('patient_id', req.params.patientId)
        .order('created_at', { ascending: false });

    res.json(data);
});

module.exports = router;