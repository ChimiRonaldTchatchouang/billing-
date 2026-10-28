-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('FACTURE', 'AVOIR');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "kind" "InvoiceKind" NOT NULL DEFAULT 'FACTURE',
ADD COLUMN     "original_invoice_id" UUID;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "last_credit_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_invoice_seq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "reconciliation_note" TEXT;


-- Le rapprochement peut aussi porter une note.
CREATE OR REPLACE FUNCTION payments_seul_rapprochement() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'status' - 'reconciled_by' - 'reconciled_at' - 'reconciliation_note')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'reconciled_by' - 'reconciled_at' - 'reconciliation_note') THEN
    RAISE EXCEPTION 'Un paiement enregistré ne peut pas être modifié.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
