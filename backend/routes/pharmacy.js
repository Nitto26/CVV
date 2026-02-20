const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

router.post('/dispense', async (req, res) => {
    const { accessCode, hospitalId } = req.body;

    try {
        // 1. Fetch prescription details
        const { data: record, error } = await supabase
            .from('medical_records')
            .select('*')
            .eq('access_code', accessCode)
            .eq('hospital_id', hospitalId)
            .single();

        if (error || !record) {
            return res.status(404).json({ error: "Invalid code or wrong hospital location." });
        }

        if (record.is_dispensed) {
            return res.status(400).json({ error: "Prescription already dispensed." });
        }

        // 2. Loop through medicines and call the fuzzy-match RPC
        for (const med of record.meds_jsonb) {
            const dailyDose = med.routine.reduce((a, b) => a + b, 0);
            const totalQty = dailyDose * med.days;

            // Notice the key matches 'req_med_name' from our SQL function
            const { error: rpcError } = await supabase.rpc('decrement_inventory', { 
                h_id: hospitalId, 
                med_name: med.name, 
                amount: totalQty 
            });

            if (rpcError) throw new Error(`Stock error: ${rpcError.message}`);
        }

        // 3. Mark the record as fulfilled
        await supabase
            .from('medical_records')
            .update({ 
                is_dispensed: true, 
                dispensed_at: new Date()
            })
            .eq('id', record.id);

        res.json({ success: true, message: "Meds successfully dispensed!" });

    } catch (err) {
        res.status(500).json({ error: "Dispensing failed", details: err.message });
    }
});

// POST /api/v1/pharmacy/add-inventory
router.post('/add-inventory', async (req, res) => {
    const { hospitalId, medicineName, stockQuantity, threshold_limit, unitPrice } = req.body;

    try {
        // .upsert() will update the row if (hospital_id + item_name) matches, 
        // otherwise it inserts a new row.
        const { data, error } = await supabase
            .from('inventory')
            .upsert({
                hospital_id: hospitalId,
                item_name: medicineName,
                stock_count: stockQuantity,
                unit_price: unitPrice,
                threshold_limit: threshold_limit,
                updated_at: new Date()
            }, {
                onConflict: 'hospital_id, item_name' 
            })
            .select();

        if (error) throw error;

        res.json({
            success: true,
            message: `Inventory updated for ${medicineName}`,
            data: data[0]
        });

    } catch (err) {
        res.status(500).json({ error: "Failed to add inventory", details: err.message });
    }
});

// GET /api/v1/pharmacy/my-inventory/:hospitalId
router.get('/my-inventory/:hospitalId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('inventory')
            .select('*')
            .eq('hospital_id', req.params.hospitalId)
            .order('item_name', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Fetch failed", details: err.message });
    }
});

module.exports = router;