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

module.exports = router;