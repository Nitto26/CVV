const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 1. VERIFY ACCESS CODE (The Handshake)
// Clinician enters the 6-digit code to see ONLY what they are allowed to see
router.post('/verify-code', async (req, res) => {
    const { accessCode } = req.body;

    try {
        const { data: prescription, error } = await supabase
            .from('medical_records')
            .select(`
                id, 
                meds_jsonb, 
                diagnosis_code, 
                patient_id,
                users (full_name, age_group)
            `)
            .eq('access_code', accessCode)
            .single();

        if (error || !prescription) {
            return res.status(404).json({ error: "Invalid or Expired Access Code" });
        }

        // Log the access for privacy auditing
        await supabase.from('access_logs').insert([{ 
            viewer_id: req.body.staffId, // Passed from frontend session
            patient_id: prescription.patient_id, 
            record_id: prescription.id,
            reason: 'Pharmacy Verification'
        }]);

        res.json(prescription);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. DISPENSE & SYNC (Inventory Connection)
// Marks med as dispensed and subtracts from the hospital's actual stock
router.post('/dispense', async (req, res) => {
    const { hospitalId, medicineName, quantity, recordId } = req.body;

    try {
        // 1. Update the Inventory count
        const { data: item } = await supabase
            .from('inventory')
            .select('id, stock_count')
            .eq('hospital_id', hospitalId)
            .eq('item_name', medicineName)
            .single();

        if (!item || item.stock_count < quantity) {
            return res.status(400).json({ error: "Insufficient stock in hospital pharmacy" });
        }

        const newCount = item.stock_count - quantity;
        await supabase.from('inventory').update({ stock_count: newCount }).eq('id', item.id);

        // 2. Mark the record as 'Fulfilled' so the code can't be used twice
        await supabase.from('medical_records').update({ access_code: null }).eq('id', recordId);

        res.json({ success: true, message: "Medicine dispensed and inventory updated", remaining: newCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. LOW STOCK ALERTS (Supply Chain Visibility)
// Returns items that need to be reordered
router.get('/alerts/:hospitalId', async (req, res) => {
    const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('hospital_id', req.params.hospitalId)
        .filter('stock_count', 'lte', 'threshold_limit'); // Using Postgres logic

    res.json(data);
});

module.exports = router;