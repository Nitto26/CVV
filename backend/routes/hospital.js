const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 1. GET ALL HOSPITALS (Public Search/Map)
// Returns every hospital with its current bed availability
router.get('/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hospitals')
            .select(`
                *,
                resources (
                    resource_type,
                    total_quantity,
                    available_quantity
                )
            `);
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. GET NEARBY HOSPITALS (Proximity Search)
// Frontend sends latitude/longitude, backend finds hospitals in that district
router.get('/nearby/:district', async (req, res) => {
    const { district } = req.params;
    const { data, error } = await supabase
        .from('hospitals')
        .select('*, resources(*)')
        .ilike('district', district); // Case-insensitive search
    
    res.json(data);
});

// 3. UPDATE RESOURCE STATUS (Admin Dashboard)
// Used by the Hospital Admin to manually update bed/ventilator counts
router.patch('/update-resource', async (req, res) => {
    const { hospitalId, resourceType, newAvailableCount } = req.body;

    const { data, error } = await supabase
        .from('resources')
        .update({ available_quantity: newAvailableCount, updated_at: new Date() })
        .eq('hospital_id', hospitalId)
        .eq('resource_type', resourceType)
        .select();

    if (error) return res.status(400).json(error);
    res.json({ message: "Resource updated successfully", data });
});

// 4. GET CRITICAL ALERTS (Regional Monitoring)
// Shows hospitals where specific resources are below 10% capacity
router.get('/critical-resources/:district', async (req, res) => {
    const { district } = req.params;
    
    const { data, error } = await supabase
        .from('national_resource_map') // Using the View we created in SQL
        .select('*')
        .eq('district', district)
        .lt('occupancy_percentage', 10); // Find resources nearly empty

    res.json(data);
});

module.exports = router;