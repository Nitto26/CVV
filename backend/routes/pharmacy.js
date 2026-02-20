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

module.exports = router;