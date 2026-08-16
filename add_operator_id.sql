-- Add operator_id column if it doesn't exist
ALTER TABLE billers ADD COLUMN IF NOT EXISTS operator_id VARCHAR(20);

-- Fix operator_id for existing billers
UPDATE billers SET operator_id = '31' WHERE (biller_id LIKE '%ELEC%' OR biller_id LIKE '%MAH%' OR biller_id LIKE '%PSPC%' OR biller_id LIKE '%TATA%' OR biller_id LIKE '%BSES%' OR biller_id LIKE '%TORR%' OR biller_id LIKE '%UPPC%' OR biller_id LIKE '%BESC%' OR biller_id LIKE '%TNEB%' OR category = 'Electricity') AND operator_id IS NULL;
UPDATE billers SET operator_id = '7' WHERE (biller_id LIKE '%AIRT%' OR category LIKE '%Mobile%' OR category LIKE '%Airtel%') AND operator_id IS NULL;
UPDATE billers SET operator_id = '249' WHERE (biller_id LIKE '%INDA%' OR biller_id LIKE '%GAS%' OR category LIKE '%Gas%') AND operator_id IS NULL;
UPDATE billers SET operator_id = '7' WHERE (biller_id LIKE '%JIO%' OR biller_id LIKE '%VODAF%' OR biller_id LIKE '%VI%') AND operator_id IS NULL;
-- Default fallback: use biller_id for any remaining NULL
UPDATE billers SET operator_id = biller_id WHERE operator_id IS NULL;

-- Now make it NOT NULL
ALTER TABLE billers ALTER COLUMN operator_id SET NOT NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_billers_operator_id ON billers(operator_id);

-- Show results
SELECT biller_id, operator_id, name, category FROM billers LIMIT 10;
