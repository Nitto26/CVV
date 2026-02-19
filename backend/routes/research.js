const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 1. OUTBREAK SENTINEL (The Heatmap Data)
// Groups diagnosis codes by district to find "hotspots"
router.get('/outbreaks', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('outbreak_sentinel') // This is the View we created in SQL
            .select('*')
            .order('total_cases', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. RESOURCE STRESS TEST (National View)
// Shows which districts are running out of beds or ventilators
router.get('/national-resources', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('national_resource_map') // Another SQL View
            .select('*')
            .order('occupancy_percentage', { ascending: true });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. ANONYMIZED DEMOGRAPHICS (Research Pillar)
// Helps scientists see which age groups are most affected by a specific disease
router.get('/demographics/:diagnosisCode', async (req, res) => {
    const { diagnosisCode } = req.params;
    
    const { data, error } = await supabase
        .from('medical_records')
        .select(`
            diagnosis_code,
            users (age_group, district)
        `)
        .eq('diagnosis_code', diagnosisCode);

    // Grouping logic for the frontend
    const stats = data.reduce((acc, curr) => {
        const age = curr.users.age_group;
        acc[age] = (acc[age] || 0) + 1;
        return acc;
    }, {});

    res.json(stats);
});

module.exports = router;