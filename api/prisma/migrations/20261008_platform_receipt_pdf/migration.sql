-- Copia del recibo pagado que queda en la carpeta «Recibos HabiliSALUD» del consultorio.
ALTER TABLE "platform_receipts" ADD COLUMN "pdf_storage_key" TEXT;
