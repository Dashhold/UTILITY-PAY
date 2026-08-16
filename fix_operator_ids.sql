-- Fix operator_id for existing billers
UPDATE billers SET operator_id = '31' WHERE (biller_id LIKE '%ELEC%' OR biller_id LIKE '%MAH%' OR category = 'Electricity') AND operator_id IS NULL;
UPDATE billers SET operator_id = '7' WHERE (biller_id LIKE '%AIRT%' OR category LIKE '%Mobile%' OR category LIKE '%Airtel%') AND operator_id IS NULL;
UPDATE billers SET operator_id = '249' WHERE (biller_id LIKE '%INDA%' OR category LIKE '%Gas%') AND operator_id IS NULL;
UPDATE billers SET operator_id = '7' WHERE biller_id LIKE '%JIO%' AND operator_id IS NULL;
-- Default fallback: use biller_id for any remaining NULL
UPDATE billers SET operator_id = biller_id WHERE operator_id IS NULL;
-- Show results
SELECT biller_id, operator_id, name, category FROM billers;
