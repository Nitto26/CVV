const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// STEP 1: Request OTP
router.post('/login-request', async (req, res) => {
    const { aadhaarNumber } = req.body;

    const { data: citizen, error } = await supabase
        .from('national_identity')
        .select('*')
        .eq('aadhaar_number', aadhaarNumber)
        .single();

    if (error || !citizen) return res.status(404).json({ error: "Aadhaar not found in National Database" });

    // Simulate OTP generation
    const mockOTP = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in DB temporarily to verify later
    await supabase.from('national_identity').update({ otp_code: mockOTP }).eq('aadhaar_number', aadhaarNumber);

    // IN A HACKATHON: We log it to the console so you can see it
    console.log(`[SMS/Email Simulation] To: ${citizen.phone_number} | Message: Your H-Sync OTP is ${mockOTP}`);

    res.json({ message: "OTP sent to registered mobile/email", mask: citizen.phone_number.slice(-4) });
});

// routes/auth.js

router.post('/verify-otp', async (req, res) => {
    const { aadhaarNumber, otpCode } = req.body;

    try {
        // 1. Verify OTP against the National Identity table
        const { data: citizen, error: otpError } = await supabase
            .from('national_identity')
            .select('*')
            .eq('aadhaar_number', aadhaarNumber)
            .eq('otp_code', otpCode)
            .maybeSingle();

        if (otpError || !citizen) return res.status(401).json({ error: "Invalid OTP" });

        // 2. Clear OTP
        await supabase.from('national_identity').update({ otp_code: null }).eq('aadhaar_number', aadhaarNumber);

        // 3. THE BRIDGE: Find or Create this person in our app's 'users' table
        let { data: appUser, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('aadhaar_hash', aadhaarNumber)
            .maybeSingle();

        // If they don't exist in our app yet, "Sign them up" automatically using Aadhaar data
        if (!appUser) {
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert([{
                    full_name: citizen.full_name,
                    email: citizen.email,
                    role: 'patient',
                    district: 'Thrissur', // Default or extracted from address
                    age_group: citizen.age_group,
                    aadhaar_hash: aadhaarNumber,
                    password_hash: 'AADHAAR_AUTH'
                }])
                .select('id')
                .single();
            
            if (createError) throw createError;
            appUser = newUser;
        }

        // 4. Return the APP USER ID (from users table)
        res.json({ 
            message: "Success", 
            patient_id: appUser.id // THIS is what the frontend uses for bookings
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/profile/:patientId', async (req, res) => {
    try {
        // 1. Find the user in our app's 'users' table using their App ID
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('aadhaar_hash') // This is the bridge
            .eq('id', req.params.patientId)
            .maybeSingle();

        if (userError || !user) return res.status(404).json({ error: "User not found" });

        // 2. Use that Aadhaar Number to fetch the rich details from the National table
        const { data: nationalData, error: nationalError } = await supabase
            .from('national_identity')
            .select('*')
            .eq('aadhaar_number', user.aadhaar_hash)
            .maybeSingle();

        if (nationalError || !nationalData) return res.status(404).json({ error: "Identity not found" });

        // 3. Combine them and return (The Frontend sees one clean object)
        res.json({
            app_id: req.params.patientId,
            full_name: nationalData.full_name,
            age_group: nationalData.age_group,
            blood_group: nationalData.blood_group,
            gender: nationalData.gender,
            address: nationalData.address,
            phone: nationalData.phone_number
        });
    } catch (err) {
        res.status(500).json({ error: "Server error fetching profile" });
    }
});

module.exports = router;