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

router.post('/verify-otp', async (req, res) => {
    const { aadhaarNumber, otpCode } = req.body;

    // 1. Check if the Aadhaar and OTP match
    const { data: citizen, error } = await supabase
        .from('national_identity')
        .select('id, full_name, age_group, aadhaar_number')
        .eq('aadhaar_number', aadhaarNumber)
        .eq('otp_code', otpCode)
        .single();

    if (error || !citizen) return res.status(401).json({ error: "Invalid OTP" });

    // 2. Clear OTP after successful use
    await supabase.from('national_identity').update({ otp_code: null }).eq('aadhaar_number', aadhaarNumber);

    // 3. Sync with your 'users' table (Check if they exist, or create them)
    let { data: user } = await supabase.from('users').select('id').eq('aadhaar_hash', aadhaarNumber).single();

    if (!user) {
        const { data: newUser } = await supabase.from('users').insert([{
            full_name: citizen.full_name,
            email: citizen.email || `user_${aadhaarNumber}@hsync.in`, // Fallback
            password_hash: 'AADHAAR_MOCK',
            role: 'patient',
            district: 'Thrissur', 
            age_group: citizen.age_group,
            aadhaar_hash: aadhaarNumber
        }]).select().single();
        user = newUser;
    }

    // ONLY return what you specified
    res.json({ 
        message: "Login Successful", 
        patient_id: user.id 
    });
});

router.get('/profile/:patientId', async (req, res) => {
    try {
        // 1. Get the Aadhaar hash from our user table first
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('aadhaar_hash')
            .eq('id', req.params.patientId)
            .single();

        if (userError || !user) return res.status(404).json({ error: "User session not found" });

        // 2. Fetch the rich profile data from the National Identity table
        const { data: profile, error: profileError } = await supabase
            .from('national_identity')
            .select('full_name, age_group, email, phone_number, gender, blood_group, address, aadhaar_number')
            .eq('aadhaar_number', user.aadhaar_hash)
            .single();

        if (profileError) throw profileError;

        res.json(profile);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch profile", details: err.message });
    }
});

module.exports = router;