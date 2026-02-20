const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// POST /api/v1/pharmacy/dispense
router.post('/dispense', async (req, res) => {
    const { accessCode } = req.body;

    try {
        // 1. Find the prescription by the access code
        const { data: record, error } = await supabase
            .from('medical_records')
            .select('*')
            .eq('access_code', accessCode)
            .single();

        if (error || !record) return res.status(404).json({ error: "Invalid or used code" });

        // 2. Process each medicine in the JSONB array
        const updates = record.meds_jsonb.map(async (med) => {
            // Logic: ([1,0,1] sum is 2) * 10 days = 20 pills
            const dailyDose = med.routine.reduce((a, b) => a + b, 0);
            const totalToSubtract = dailyDose * med.days;

            // Call the SQL function we just created
            return supabase.rpc('decrement_inventory', { 
                h_id: record.hospital_id, 
                med_name: med.name, 
                amount: totalToSubtract 
            });
        });

        await Promise.all(updates);

        // 3. SECURE: Clear the access code so it can't be used again
        await supabase
            .from('medical_records')
            .update({ access_code: null }) 
            .eq('id', record.id);

        res.json({ 
            success: true, 
            message: "Meds dispensed. Inventory updated.",
            dispensed: record.meds_jsonb 
        });

    } catch (err) {
        res.status(500).json({ error: "Dispensing failed", details: err.message });
    }
});

module.exports = router;