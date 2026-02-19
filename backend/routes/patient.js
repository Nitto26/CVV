const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Function to calculate distance in KM using Haversine Formula
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
};

router.post('/diagnose', async (req, res) => {
    try {
        const { symptomText, userLat, userLong } = req.body;
        console.log("User Coords:", userLat, userLong);

        // 1. Groq AI Triage
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `You are a hospital routing assistant. 
                    You MUST return ONLY a raw JSON object. 
                    No markdown, no backticks, no text before or after.
                    
                    Structure:
                    {
                      "spec": "General Medicine" | "Cardiology" | "Pediatrics" | "Dermatology" | "Orthopedics" | "Neurology",
                      "urgency": number (1-10),
                      "advice": "one sentence string"
                    }` 
                },
                { role: "user", content: `Patient symptoms: "${symptomText}"` }
            ],
            model: "llama-3.1-8b-instant",
            // This is key: it forces the model to output a JSON object
            response_format: { type: "json_object" } 
        });

        // 2. EXTRA SAFETY: Regex Cleanup
        let rawContent = chatCompletion.choices[0].message.content;
        
        // This removes ```json and ``` if the AI accidentally adds them
        const cleanedContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
        
        const aiData = JSON.parse(cleanedContent);

        // 2. Fetch Doctors + Hospital Info + Existing Appointments (for Token calculation)
        const { data: doctors, error } = await supabase
            .from('staff')
            .select(`
                *,
                hospitals(name, district, latitude, longitude),
                appointments(id, status),
                users(id,full_name)
            `)
            .eq('specialization', aiData.spec)
            .eq('is_available', true)
            .eq('appointments.status', 'waiting'); // Only count waiting patients

        if (error) throw error;

        // 3. Process the data (Distance & Tokens)
        const enrichedDoctors = doctors.map(doc => {
            // Calculate Distance
            let distance = null;
            if (userLat && userLong && doc.hospitals.latitude && doc.hospitals.longitude) {
                // console.log("Hospital Coords:", doc.hospitals.latitude, doc.hospitals.longitude);
                distance = getDistance(userLat, userLong, doc.hospitals.latitude, doc.hospitals.longitude);
            }

            // Calculate Tokens Left
            const waitingCount = doc.appointments ? doc.appointments.length : 0;
            const tokensLeft = doc.token_limit - waitingCount;

            return {
                id: doc.id,
                name: doc.users.full_name, // Ensure this exists or join users table
                specialization: doc.specialization,
                hospital: doc.hospitals.name,
                distance: distance ? parseFloat(distance.toFixed(2)) : null,
                tokensLeft: tokensLeft > 0 ? tokensLeft : 0,
                isFull: tokensLeft <= 0
            };
        });

        // 4. Sort by Distance (Closest first)
        const sortedDoctors = enrichedDoctors.sort((a, b) => a.distance - b.distance);

        res.json({ 
            aiAnalysis: aiData, 
            recommendedDoctors: sortedDoctors 
        });

    } catch (err) {
        res.status(500).json({ error: "AI routing failed", details: err.message });
    }
});

router.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.json([]);

    try {
        const searchTerm = query.toLowerCase();

        // 1. Notice we do NOT use .single() or .maybeSingle() at the end
        const { data, error } = await supabase
            .from('doctor_search_view')
            .select('*')
            .ilike('search_text', `%${searchTerm}%`)
            .eq('is_available', true); // Only show doctors currently on duty

        if (error) throw error;

        // 2. Data will be an array [{}, {}, {}]
        res.json(data); 
    } catch (err) {
        console.error("Search Error:", err.message);
        res.status(500).json({ error: "Search failed." });
    }
});

// 2. MY APPOINTMENTS: Let the user see their tokens
router.get('/my-tokens/:patientId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .select(`
                id, token_number, status, created_at,
                staff (
                    specialization,
                    users (full_name),
                    hospitals (name)
                )
            `)
            .eq('patient_id', req.params.patientId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
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