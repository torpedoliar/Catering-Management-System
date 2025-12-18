-- Add NIK column to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nik" VARCHAR(30) UNIQUE;

-- Create index for NIK search
CREATE INDEX IF NOT EXISTS "User_nik_idx" ON "User"("nik");

-- Generate random 7-digit NIK for existing users
DO $$
DECLARE
    user_record RECORD;
    new_nik VARCHAR(30);
    nik_exists BOOLEAN;
BEGIN
    FOR user_record IN SELECT id FROM "User" WHERE nik IS NULL
    LOOP
        LOOP
            -- Generate random 7-digit number
            new_nik := LPAD(FLOOR(RANDOM() * 10000000)::TEXT, 7, '0');
            
            -- Check if NIK already exists
            SELECT EXISTS(SELECT 1 FROM "User" WHERE nik = new_nik) INTO nik_exists;
            
            EXIT WHEN NOT nik_exists;
        END LOOP;
        
        -- Update user with new NIK
        UPDATE "User" SET nik = new_nik WHERE id = user_record.id;
    END LOOP;
END $$;
