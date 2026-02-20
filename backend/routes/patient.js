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

// GET /api/v1/patient/find-pharmacy/:prescriptionId
router.get('/find-pharmacy/:prescriptionId', async (req, res) => {
    try {
        // 1. Get the medicines required for this prescription
        const { data: prescription, error: pError } = await supabase
            .from('medical_records')
            .select('meds_jsonb')
            .eq('id', req.params.prescriptionId)
            .single();

        if (pError || !prescription) return res.status(404).json({ error: "Prescription not found" });

        const requiredMeds = prescription.meds_jsonb.map(m => m.name);
        const totalMedsCount = requiredMeds.length;

        // 2. Build a fuzzy search filter
        // This converts ['Paracetamol', 'Dolo'] into "item_name.ilike.*Paracetamol*,item_name.ilike.*Dolo*"
        const fuzzyFilter = requiredMeds
            .map(med => `item_name.ilike.*${med}*`)
            .join(',');

        // 3. Query inventory for partial matches across all hospitals
        const { data: matches, error: iError } = await supabase
            .from('inventory')
            .select(`
                item_name,
                stock_count,
                hospital_id,
                hospitals (name, district, latitude, longitude)
            `)
            .or(fuzzyFilter) 
            .gt('stock_count', 0); // Must be in stock

        if (iError) throw iError;

        // 4. Group matches by Hospital and verify complete stock
        const hospitalGroups = matches.reduce((acc, item) => {
            const hId = item.hospital_id;
            if (!acc[hId]) {
                acc[hId] = {
                    info: item.hospitals,
                    matchedRequirements: new Set(),
                    stockDetails: []
                };
            }

            // Check which of our required meds this inventory item satisfies
            requiredMeds.forEach(reqMed => {
                if (item.item_name.toLowerCase().includes(reqMed.toLowerCase())) {
                    acc[hId].matchedRequirements.add(reqMed);
                    acc[hId].stockDetails.push({
                        needed: reqMed,
                        found: item.item_name,
                        stock: item.stock_count
                    });
                }
            });
            return acc;
        }, {});

        // 5. Filter: Only return hospitals that matched ALL required medicines
        const availableLocations = Object.values(hospitalGroups)
            .filter(h => h.matchedRequirements.size === totalMedsCount)
            .map(h => ({
                hospitalName: h.info.name,
                district: h.info.district,
                latitude: h.info.latitude,
                longitude: h.info.longitude,
                availableInventory: h.stockDetails
            }));

        res.json({
            required: requiredMeds,
            count: availableLocations.length,
            locations: availableLocations
        });

    } catch (err) {
        res.status(500).json({ error: "Locator failed", details: err.message });
    }
});

// 1. GET MY PRESCRIPTIONS (Secure & Private)
router.get('/my-prescriptions/:patientId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('medical_records')
            .select(`
                id,
                access_code,
                created_at,
                diagnosis_code,
                meds_jsonb,
                lab_tests_ordered,
                is_inpatient,
                staff!inner (
                    users (full_name),
                    specialization
                ),
                hospitals!inner (name)
            `)
            .eq('patient_id', req.params.patientId) // THE SECURITY LOCK
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Flatten for the frontend
        const result = data.map(record => ({
            id: record.id,
            date: record.created_at,
            doctor: record.staff.users.full_name,
            hospital: record.hospitals.name,
            diagnosis: record.diagnosis_code,
            meds: record.meds_jsonb,
            tests: record.lab_tests_ordered,
            isInpatient: record.is_inpatient,
            access_code: record.access_code
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "Access Denied", details: err.message });
    }
});

module.exports = router;