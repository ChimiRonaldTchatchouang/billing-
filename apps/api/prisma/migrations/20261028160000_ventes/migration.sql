-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "client_event_id" UUID;

-- AlterTable
ALTER TABLE "sale_lines" ADD COLUMN     "catalog_price_ttc" INTEGER,
ADD COLUMN     "original_line_id" UUID;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "change_given" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_client_event_id_key" ON "audit_logs"("client_event_id");


-- Une vente reçue n'est plus modifiée : un retour crée une nouvelle vente liée.
CREATE TRIGGER sales_immuable
  BEFORE UPDATE ON "sales"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();

CREATE TRIGGER sale_lines_immuable
  BEFORE UPDATE OR DELETE ON "sale_lines"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();

-- Un paiement ne change que par son rapprochement.
CREATE FUNCTION payments_seul_rapprochement() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'status' - 'reconciled_by' - 'reconciled_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'reconciled_by' - 'reconciled_at') THEN
    RAISE EXCEPTION 'Un paiement enregistré ne peut pas être modifié.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_immuable
  BEFORE UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION payments_seul_rapprochement();

CREATE TRIGGER payments_non_supprimable
  BEFORE DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
