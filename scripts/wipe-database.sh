#!/usr/bin/env bash
# Borra datos operativos de BD habilisalud. Conserva catálogos CIE/CUPS/diagnósticos.
# El superadmin se recrea al reiniciar la API.
#
# Uso:
#   ./scripts/wipe-database.sh --yes
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

YES=0
for arg in "$@"; do
  [[ "$arg" == "--yes" ]] && YES=1
done

echo "⚠️  Esto BORRA pacientes, citas, consultorios, documentos y usuarios."
echo "    Solo quedan catálogos (CIE/CUPS) y se recreará el superadmin."
if [[ "$YES" -ne 1 ]]; then
  read -r -p "Escribe BORRAR para confirmar: " confirm
  if [[ "$confirm" != "BORRAR" ]]; then
    echo "Cancelado."
    exit 1
  fi
fi

export PGPASSWORD="${PGPASSWORD:-root}"

echo "==> Truncando tablas operativas…"
psql -h localhost -U postgres -d habilisalud -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
TRUNCATE TABLE
  document_signatures,
  document_files,
  document_requirements,
  document_categories,
  stored_files,
  appointment_admissions,
  appointments,
  notification_logs,
  clarification_notes,
  clinical_evolutions,
  clinical_alerts,
  diagnoses,
  clinical_procedures,
  clinical_attachments,
  clinical_records,
  incapacities,
  patient_consents,
  consents,
  encounters,
  rda_exports,
  invoice_items,
  invoices,
  transactions,
  session_packages,
  equipment_maintenances,
  equipment_resumes,
  expiry_alerts,
  supply_items,
  reps_checklist_items,
  reps_checklists,
  quality_snapshots,
  audit_logs,
  form_templates,
  patients,
  users,
  clinics
RESTART IDENTITY CASCADE;
COMMIT;
SQL

echo "==> Limpiando api/storage…"
find "$ROOT/api/storage" -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} + 2>/dev/null || true
mkdir -p "$ROOT/api/storage"
touch "$ROOT/api/storage/.gitkeep"

echo "==> Reiniciando API…"
docker compose restart api
sleep 6
docker compose logs --tail=8 api

echo "==> Resembrando expediente documental (checklist + SG-SST)…"
(cd "$ROOT/api" && npx prisma db seed) || echo "    Aviso: seed falló; ejecuta: cd api && npx prisma db seed"

echo ""
echo "Listo. Base limpia. Superadmin: dankojimenez@habilisalud.com"
echo "Crea de nuevo el consultorio y su admin desde el panel (o restaurarlos)."
echo "Luego, si hiciste el consultorio DESPUÉS del seed: cd api && npx prisma db seed"
