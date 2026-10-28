-- AlterTable
ALTER TABLE "registers" ADD COLUMN     "device_secret_hash" TEXT,
ADD COLUMN     "enroll_code_expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "enroll_code_hash" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "reset_expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "reset_token_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "registers_enroll_code_hash_key" ON "registers"("enroll_code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "users_reset_token_hash_key" ON "users"("reset_token_hash");

